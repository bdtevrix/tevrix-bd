/**
 * HireMinds BD — the clock and the hands.
 * Bound to the Sheet "HireMinds BD — Outreach". Runs as each mailbox account (the BD account first).
 *
 * Settings tab: everything visible. Script Properties: GITHUB_TOKEN, CIO_SITE_ID, CIO_API_KEY, CHAT_WEBHOOK.
 * Columns are always looked up by header name, never by position.
 */

// ------------------------------------------------------------------ constants

var TAB = {
  OUTREACH: 'Outreach', LEADS: 'Leads', LINKEDIN: 'LinkedIn', DNC: 'Do not contact',
  LOG: 'Log', SETTINGS: 'Settings'
};

// Kept in sync with schema/headers.json by tests/test_schema.py.
var HEADERS = {
  'Outreach': ['decision', 'stage', 'company', 'country', 'contact_name', 'contact_title', 'email', 'email_status',
    'signal', 'score', 'angle', 'subject', 'email_1', 'follow_up_1', 'follow_up_2', 'linkedin_note', 'dossier',
    'fit_reason', 'reviewer_notes', 'lead_id', 'mailbox', 'decided_at', 'thread_id', 'message_id', 'sent_1_at',
    'sent_2_at', 'sent_3_at', 'replied_at', 'reply_label', 'reply_text', 'reply_draft', 'reply_decision',
    'reply_sent_at', 'bounced_at', 'cio_synced_at'],
  'Leads': ['lead_id', 'found_at', 'source', 'segment', 'company', 'domain', 'website', 'country', 'company_size',
    'open_roles', 'roles_sample', 'signal', 'job_urls', 'ceo_name', 'contact_name', 'contact_title', 'email',
    'email_source', 'email_status', 'pattern', 'people_found', 'status', 'notes'],
  'LinkedIn': ['date', 'founder', 'name', 'title', 'company', 'search_link', 'note', 'sent', 'accepted', 'lead_id'],
  'Do not contact': ['value', 'reason', 'added_at', 'source'],
  'Log': ['time', 'mailbox', 'action', 'lead_id', 'detail'],
  'Settings': ['key', 'value', 'notes']
};

var COUNTRY_TZ = {
  'uk': 'Europe/London', 'united kingdom': 'Europe/London', 'gb': 'Europe/London', 'england': 'Europe/London',
  'scotland': 'Europe/London', 'wales': 'Europe/London', 'northern ireland': 'Europe/London',
  'ireland': 'Europe/Dublin', 'ie': 'Europe/Dublin',
  'uae': 'Asia/Dubai', 'united arab emirates': 'Asia/Dubai', 'ae': 'Asia/Dubai',
  'singapore': 'Asia/Singapore', 'sg': 'Asia/Singapore',
  'australia': 'Australia/Sydney', 'au': 'Australia/Sydney',
  'new zealand': 'Pacific/Auckland', 'nz': 'Pacific/Auckland',
  'united states': 'America/New_York', 'us': 'America/New_York', 'usa': 'America/New_York',
  'canada': 'America/Toronto', 'ca': 'America/Toronto',
  'india': 'Asia/Kolkata', 'in': 'Asia/Kolkata'
};
var US_COUNTRIES = ['united states', 'us', 'usa'];
// Opt-in EU countries are emailed by hand only.
var NO_AUTO_SEND = ['germany', 'de', 'austria', 'at', 'netherlands', 'nl', 'the netherlands'];

var ACTIVE_STAGES = ['approved', 'sent_1', 'sent_2', 'sent_3'];
var WATCH_STAGES = ['sent_1', 'sent_2', 'sent_3', 'finished'];
var HANDLERS = ['sendTick', 'checkTick', 'dispatchIntake', 'dailySummary', 'cioSync'];
var IST = 'Asia/Kolkata';
var PROCESSED_LABEL = 'bd-processed';

var OOO_RE = /(out of (the )?office|automatic reply|auto[- ]?reply|autoreply|on (annual |parental |maternity |sick )?leave|away from (my|the) (desk|office)|limited access to (my )?e-?mail|currently (away|travelling|traveling|on holiday|on vacation)|on holiday|on vacation|will be back on|returning on)/i;
var UNSUB_RE = /(unsubscribe|remove me|take me off|opt[ -]?out|not interested|no thanks|no, thanks|do not (contact|email) me|don't (contact|email) me|^\s*stop\b)/im;

// ------------------------------------------------------------------ menu and onEdit

function onOpen() {
  SpreadsheetApp.getUi().createMenu('HireMinds BD')
    .addItem('Install triggers', 'installTriggers')
    .addItem('Run intake now', 'runIntakeNow')
    .addItem('Send now', 'sendNow')
    .addItem('Check replies now', 'checkNow')
    .addItem('Pause / Resume sending', 'togglePause')
    .addItem('Send test email to me', 'sendTestEmail')
    .addToUi();
}

/** Simple trigger: approve / skip in the decision column. */
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() !== TAB.OUTREACH) return;
  var t = table_(TAB.OUTREACH);
  var decCol = t.col('decision');
  var first = e.range.getColumn(), last = first + e.range.getNumColumns() - 1;
  if (decCol < first || decCol > last) return;
  var S = settings_();
  for (var r = e.range.getRow(); r < e.range.getRow() + e.range.getNumRows(); r++) {
    if (r < 2) continue;
    applyDecision_(t, r, S);
  }
}

function applyDecision_(t, r, S) {
  var decision = String(t.get(r, 'decision')).trim().toLowerCase();
  var stage = String(t.get(r, 'stage')).trim();
  if (['', 'drafted', 'approved', 'skipped'].indexOf(stage) < 0) return; // already in flight: leave it
  if (decision === 'approve' && stage !== 'approved') {
    t.set(r, 'stage', 'approved');
    t.set(r, 'decided_at', new Date());
    if (!t.get(r, 'mailbox')) t.set(r, 'mailbox', leastLoadedMailbox_(t, S));
    if (String(t.get(r, 'email_status')) !== 'safe') {
      note_(t, r, 'Will not send: email_status is "' + t.get(r, 'email_status') + '" (only safe sends).');
    }
  } else if (decision === 'skip' && stage !== 'skipped') {
    t.set(r, 'stage', 'skipped');
    t.set(r, 'decided_at', new Date());
  }
}

function leastLoadedMailbox_(t, S) {
  var boxes = list_(S.MAILBOXES);
  if (!boxes.length) return '';
  var load = {};
  boxes.forEach(function (b) { load[b] = 0; });
  for (var r = 2; r <= t.lastRow; r++) {
    var m = String(t.get(r, 'mailbox')).toLowerCase();
    if (m in load && ACTIVE_STAGES.indexOf(String(t.get(r, 'stage'))) >= 0) load[m]++;
  }
  return boxes.reduce(function (a, b) { return load[b] < load[a] ? b : a; });
}

// ------------------------------------------------------------------ triggers

function installTriggers() {
  var me = me_(), S = settings_();
  ScriptApp.getProjectTriggers().forEach(function (tr) {
    if (HANDLERS.indexOf(tr.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('sendTick').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('checkTick').timeBased().everyHours(1).create();
  var boxes = list_(S.MAILBOXES);
  var scheduler = !boxes.length || boxes[0] === me;
  if (scheduler) {
    ScriptApp.newTrigger('dispatchIntake').timeBased().atHour(1).everyDays(1).inTimezone(IST).create();
    ScriptApp.newTrigger('dailySummary').timeBased().atHour(20).everyDays(1).inTimezone(IST).create();
    ScriptApp.newTrigger('cioSync').timeBased().everyHours(1).create();
  }
  getLabel_();
  log_('install_triggers', '', scheduler ? 'sender + scheduler' : 'sender only');
  toast_('Triggers installed for ' + me + (scheduler ? ' (sender + scheduler).' : ' (sender only).'));
}

function sendNow() { withLock_(function () { runSends_(true); }); toast_('Send run finished. See the Log tab.'); }
function checkNow() { withLock_(function () { runChecks_(); }); toast_('Reply check finished. See the Log tab.'); }
function runIntakeNow() { dispatch_(settings_().INTAKE_WORKFLOW || 'intake.yml'); toast_('Intake started on GitHub.'); }

function togglePause() {
  var paused = truthy_(settings_().SENDING_PAUSED);
  setSetting_('SENDING_PAUSED', paused ? 'FALSE' : 'TRUE');
  log_(paused ? 'resume' : 'pause', '', 'by ' + me_());
  toast_(paused ? 'Sending resumed.' : 'Sending paused.');
}

function sendTick() { withLock_(function () { runSends_(false); }); }
function checkTick() { withLock_(function () { runChecks_(); }); }

// ------------------------------------------------------------------ sending

function runSends_(manual) {
  var S = settings_();
  if (truthy_(S.SENDING_PAUSED)) return;
  var testMode = truthy_(S.TEST_MODE);
  if (testMode && !S.TEST_RECIPIENT) { log_('send_blocked', '', 'TEST_MODE is on but TEST_RECIPIENT is blank'); return; }
  var me = me_(), boxes = list_(S.MAILBOXES);
  var cap = num_(S.DAILY_CAP_PER_MAILBOX, 20), maxRun = num_(S.MAX_SENDS_PER_RUN, 3);
  var t = table_(TAB.OUTREACH);
  var dnc = dncSet_();
  var now = new Date();

  // Safety net: approvals made through the API do not fire onEdit.
  for (var r0 = 2; r0 <= t.lastRow; r0++) {
    if (String(t.get(r0, 'decision')) && ['', 'drafted'].indexOf(String(t.get(r0, 'stage'))) >= 0) applyDecision_(t, r0, S);
  }

  var mine = function (r) {
    var m = String(t.get(r, 'mailbox')).trim().toLowerCase();
    if (m) return m === me;
    if (!boxes.length || boxes[0] === me) { t.set(r, 'mailbox', me); return true; }
    return false;
  };

  var queue = [];
  for (var r = 2; r <= t.lastRow; r++) {
    var stage = String(t.get(r, 'stage'));
    if (String(t.get(r, 'reply_decision')) === 'send' && !t.get(r, 'reply_sent_at') && t.get(r, 'reply_draft')) {
      if (mine(r)) queue.push({ r: r, kind: 'reply', p: 0 });
      continue;
    }
    if (ACTIVE_STAGES.indexOf(stage) < 0 || !mine(r)) continue;
    var sent1 = date_(t.get(r, 'sent_1_at'));
    var days = sent1 ? (now - sent1) / 86400000 : 0;
    if (stage === 'approved' && String(t.get(r, 'decision')) === 'approve' && !sent1) {
      queue.push({ r: r, kind: 'first', p: 1 });
    } else if (stage === 'sent_1' && days >= num_(S.FOLLOWUP_1_AFTER_DAYS, 4)) {
      queue.push({ r: r, kind: 'fu1', p: 2 });
    } else if (stage === 'sent_2' && days >= num_(S.FOLLOWUP_2_AFTER_DAYS, 10)) {
      queue.push({ r: r, kind: 'fu2', p: 3 });
    }
    if (/^sent_/.test(stage) && days >= num_(S.FINISH_AFTER_DAYS, 15)) {
      t.set(r, 'stage', 'finished');
      log_('finished', t.get(r, 'lead_id'), 'no reply after ' + Math.floor(days) + ' days');
    }
  }
  queue.sort(function (a, b) { return a.p - b.p || a.r - b.r; });

  var sentThisRun = 0;
  for (var i = 0; i < queue.length && sentThisRun < maxRun; i++) {
    var q = queue[i], row = q.r, lid = t.get(row, 'lead_id');
    if (q.kind !== 'reply' && /^(finished|replied|dnc|bounced)$/.test(String(t.get(row, 'stage')))) continue;
    if (q.kind !== 'reply' && sentToday_() >= cap) { log_('cap_reached', '', 'daily cap ' + cap); break; }
    try {
      var ok = q.kind === 'reply' ? sendReply_(t, row, S, dnc, testMode)
        : sendSequence_(t, row, q.kind, S, dnc, testMode, manual && testMode);
      if (ok) {
        sentThisRun++;
        if (q.kind !== 'reply') bumpSentToday_();
        if (sentThisRun < maxRun && i < queue.length - 1) Utilities.sleep(20000 + Math.floor(Math.random() * 40000));
      }
    } catch (err) {
      log_('send_error', lid, String(err).slice(0, 400));
    }
  }
}

/** First email or a follow-up. Returns true if an email went out. */
function sendSequence_(t, r, kind, S, dnc, testMode, ignoreWindow) {
  var lid = t.get(r, 'lead_id');
  var email = String(t.get(r, 'email')).trim().toLowerCase();
  var country = String(t.get(r, 'country')).trim().toLowerCase();
  if (!email) return skip_(t, r, 'No email address.');
  if (String(t.get(r, 'email_status')) !== 'safe') return false;
  if (isDnc_(email, dnc)) { t.set(r, 'stage', 'dnc'); log_('dnc_block', lid, email); return false; }
  if (NO_AUTO_SEND.indexOf(country) >= 0) return skip_(t, r, 'Germany / Austria / Netherlands: email by hand only.');
  if (US_COUNTRIES.indexOf(country) >= 0 && !String(S.POSTAL_ADDRESS || '').trim()) {
    return skip_(t, r, 'US lead: fill POSTAL_ADDRESS in Settings before sending (CAN-SPAM).');
  }
  var tz = COUNTRY_TZ[country];
  if (!tz) return skip_(t, r, 'Unknown country "' + t.get(r, 'country') + '": use a country from the time-zone table.');
  if (!ignoreWindow && !inWindow_(tz, S)) return false;

  var subject = String(t.get(r, 'subject')).trim();
  var threadId = String(t.get(r, 'thread_id'));
  var body, next, stamp;
  if (kind === 'first') {
    body = t.get(r, 'email_1'); next = 'sent_1'; stamp = 'sent_1_at';
    if (!subject || !body) return skip_(t, r, 'Subject or email_1 is empty.');
  } else {
    // A fresh reply check on the thread before any follow-up.
    if (threadId && checkThreadRow_(t, r, S, dnc)) return false;
    body = t.get(r, kind === 'fu1' ? 'follow_up_1' : 'follow_up_2');
    next = kind === 'fu1' ? 'sent_2' : 'sent_3';
    stamp = kind === 'fu1' ? 'sent_2_at' : 'sent_3_at';
    if (!String(body).trim()) { // nothing written for this step: move on without sending
      t.set(r, 'stage', next);
      log_('followup_skipped', lid, kind + ' is empty');
      return false;
    }
    subject = /^re:/i.test(subject) ? subject : 'Re: ' + subject;
  }

  var res = sendRaw_({
    to: testMode ? S.TEST_RECIPIENT : email,
    subject: (testMode ? '[TEST] ' : '') + subject,
    body: withSignature_(String(body), S),
    html: htmlEmail_(String(body), S, { first: kind === 'first' }),
    S: S,
    threadId: kind === 'first' ? null : threadId,
    inReplyTo: kind === 'first' ? null : String(t.get(r, 'message_id'))
  });
  if (kind === 'first') {
    t.set(r, 'thread_id', res.threadId);
    t.set(r, 'message_id', res.messageId);
  }
  t.set(r, stamp, new Date());
  t.set(r, 'stage', next);
  log_('sent_' + kind, lid, (testMode ? '[TEST to ' + S.TEST_RECIPIENT + '] ' : '') + email + ' | ' + subject);
  return true;
}

/** An approved reply in an existing thread. */
function sendReply_(t, r, S, dnc, testMode) {
  var lid = t.get(r, 'lead_id');
  var threadId = String(t.get(r, 'thread_id'));
  var them = lastInbound_(threadId, S);
  var to = them ? them.from : String(t.get(r, 'email')).toLowerCase();
  if (isDnc_(to, dnc)) { t.set(r, 'reply_decision', ''); log_('dnc_block', lid, to); return false; }
  var subject = String(t.get(r, 'subject'));
  subject = /^re:/i.test(subject) ? subject : 'Re: ' + subject;
  var res = sendRaw_({
    to: testMode ? S.TEST_RECIPIENT : to,
    subject: (testMode ? '[TEST] ' : '') + subject,
    body: withSignature_(String(t.get(r, 'reply_draft')), S, true),
    html: htmlEmail_(String(t.get(r, 'reply_draft')), S, { reply: true }),
    S: S,
    threadId: threadId || null,
    inReplyTo: them ? them.messageId : String(t.get(r, 'message_id')),
    references: them ? them.references : ''
  });
  if (!threadId) t.set(r, 'thread_id', res.threadId);
  t.set(r, 'reply_sent_at', new Date());
  log_('sent_reply', lid, (testMode ? '[TEST] ' : '') + to);
  return true;
}

function withSignature_(body, S, isReply) {
  var lines = [String(body).replace(/\s+$/, ''), '', 'Best regards,', ''];
  lines.push(perAccount_(S.SENDER_NAME));
  if (perAccount_(S.SENDER_TITLE)) lines.push(perAccount_(S.SENDER_TITLE));
  if (S.COMPANY_LINE) lines.push(S.COMPANY_LINE);
  var sigEmail = perAccount_(S.SIG_EMAIL) || perAccount_(S.SEND_AS);
  if (sigEmail) lines.push('Email: ' + sigEmail);
  if (!isReply) {
    lines.push('');
    lines.push("Not relevant? Reply 'no thanks' and I won't write again.");
  }
  if (String(S.POSTAL_ADDRESS || '').trim()) lines.push(String(S.POSTAL_ADDRESS || '').trim());
  return lines.join('\n');
}

/**
 * HTML version of the same email: plain-looking body plus a branded signature.
 * Optional Settings (each can be per-account, "bd@x.com=value, raj@x.com=value"):
 *   SIG_LINKEDIN (URL), SIG_WHATSAPP (number with country code, e.g. +91 98xxxxxx; shown in replies only,
 *   unless WHATSAPP_ON_ALL_EMAILS = TRUE), SIG_LOCATION,
 *   SIG_EMAIL (defaults to SEND_AS), SIG_WEBSITE (defaults to www.tevrixai.com),
 *   LOGO_URL (a public https PNG; blank = use the Tevrix AI logo built into this script, sent inline),
 *   LOGO_INLINE (FALSE = no built-in logo), LOGO_ON_FIRST_EMAIL (FALSE = logo on follow-ups and replies only).
 */
function htmlEmail_(body, S, opt) {
  opt = opt || {};
  var font = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222222;';
  var orange = 'color:#e8890c;';
  var link = 'color:#1155cc;text-decoration:underline;';
  var name = esc_(perAccount_(S.SENDER_NAME));
  var title = esc_(perAccount_(S.SENDER_TITLE));
  var linkedin = perAccount_(S.SIG_LINKEDIN);
  var whatsapp = String(perAccount_(S.SIG_WHATSAPP) || '').replace(/[^\d]/g, '');
  if (!opt.reply && String(S.WHATSAPP_ON_ALL_EMAILS).toUpperCase() !== 'TRUE') whatsapp = '';
  var location = esc_(perAccount_(S.SIG_LOCATION));
  var email = perAccount_(S.SIG_EMAIL) || perAccount_(S.SEND_AS) || me_();
  var site = perAccount_(S.SIG_WEBSITE) || 'www.tevrixai.com';
  var siteUrl = /^https?:\/\//i.test(site) ? site : 'https://' + site;
  var logo = perAccount_(S.LOGO_URL);
  var logoSrc = /^https:\/\//i.test(logo) ? logo
    : (LOGO_PNG_B64 && String(S.LOGO_INLINE).toUpperCase() !== 'FALSE' ? 'cid:' + LOGO_CID : '');
  var showLogo = !!logoSrc && !(opt.first && String(S.LOGO_ON_FIRST_EMAIL).toUpperCase() === 'FALSE');

  var html = '<div style="' + font + '">' + esc_(String(body).replace(/\s+$/, '')).replace(/\r?\n/g, '<br>') + '</div>';
  var sig = [];
  sig.push('<div style="' + font + 'margin-top:16px;">Best regards,</div>');
  sig.push('<div style="' + font + 'color:#888888;">--</div>');
  if (showLogo) {
    sig.push('<div style="margin:4px 0 6px 0;"><a href="' + escAttr_(siteUrl) + '"><img src="' + escAttr_(logoSrc) +
      '" alt="Tevrix AI" width="100" height="98" style="display:block;width:100px;height:98px;border:0;"></a></div>');
  }
  if (name) sig.push('<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:20px;color:#1a5fa8;">' + name + '</div>');
  if (title) sig.push('<div style="' + font + '">' + title + '</div>');
  var social = [];
  if (/^https?:\/\//i.test(linkedin)) social.push('<a href="' + escAttr_(linkedin) + '" style="' + link + '">LinkedIn</a>');
  if (whatsapp) social.push('<a href="https://wa.me/' + whatsapp + '" style="' + link + '">WhatsApp</a>');
  if (social.length) sig.push('<div style="' + font + '">' + social.join(' - ') + '</div>');
  if (location) sig.push('<div style="' + font + orange + '">' + location + '</div>');
  if (email) sig.push('<div style="' + font + orange + '">Email: <a href="mailto:' + escAttr_(email) + '" style="' + link + '">' + esc_(email) + '</a></div>');
  sig.push('<div style="' + font + orange + '">Website: <a href="' + escAttr_(siteUrl) + '" style="' + link + '">' + esc_(site.replace(/^https?:\/\//i, '')) + '</a></div>');
  var foot = [];
  if (!opt.reply) foot.push("Not relevant? Reply 'no thanks' and I won't write again.");
  if (String(S.POSTAL_ADDRESS || '').trim()) foot.push(esc_(String(S.POSTAL_ADDRESS || '').trim()));
  var footer = foot.length ? '<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888888;margin-top:14px;">' +
    foot.join('<br>') + '</div>' : '';
  return '<!doctype html><html><body>' + html + sig.join('') + footer + '</body></html>';
}

function esc_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr_(s) { return esc_(s).replace(/"/g, '&quot;'); }

/** Gmail API send with a raw RFC 822 message. Returns {id, threadId, messageId}. */
function sendRaw_(o) {
  var from = perAccount_(o.S.SEND_AS) || me_();
  var name = perAccount_(o.S.SENDER_NAME);
  var raw = buildRaw_({
    from: from, fromName: name, to: o.to, subject: o.subject, body: o.body, html: o.html,
    inReplyTo: o.inReplyTo, references: o.references
  });
  var req = { raw: Utilities.base64EncodeWebSafe(raw, Utilities.Charset.UTF_8) };
  if (o.threadId) req.threadId = o.threadId;
  var sent = Gmail.Users.Messages.send(req, 'me');
  var meta = Gmail.Users.Messages.get('me', sent.id, { format: 'metadata', metadataHeaders: ['Message-ID'] });
  var mid = header_(meta.payload && meta.payload.headers, 'Message-ID');
  return { id: sent.id, threadId: sent.threadId, messageId: mid };
}

function buildRaw_(o) {
  var unsubTo = o.from;
  var h = [];
  h.push('From: ' + (o.fromName ? encodeName_(o.fromName) + ' ' : '') + '<' + o.from + '>');
  h.push('To: ' + o.to);
  h.push('Subject: ' + encodeHeader_(o.subject));
  h.push('MIME-Version: 1.0');
  h.push('List-Unsubscribe: <mailto:' + unsubTo + '?subject=unsubscribe>');
  if (o.inReplyTo) {
    h.push('In-Reply-To: ' + o.inReplyTo);
    h.push('References: ' + ((o.references ? o.references + ' ' : '') + o.inReplyTo).trim());
  }
  function part(text) {
    return Utilities.base64Encode(text, Utilities.Charset.UTF_8).replace(/(.{76})/g, '$1\r\n');
  }
  if (!o.html) {
    h.push('Content-Type: text/plain; charset=UTF-8');
    h.push('Content-Transfer-Encoding: base64');
    return h.join('\r\n') + '\r\n\r\n' + part(o.body);
  }
  var b = 'tevrix_' + Utilities.getUuid().replace(/-/g, '');
  var htmlPart = 'Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + part(o.html);
  if (o.html.indexOf('cid:' + LOGO_CID) >= 0) { // logo travels inside the email: multipart/related
    var rb = b + '_rel';
    htmlPart = 'Content-Type: multipart/related; boundary="' + rb + '"\r\n\r\n' +
      '--' + rb + '\r\n' + htmlPart + '\r\n' +
      '--' + rb + '\r\nContent-Type: image/png; name="tevrix-ai.png"\r\nContent-Transfer-Encoding: base64\r\n' +
      'Content-ID: <' + LOGO_CID + '>\r\nContent-Disposition: inline; filename="tevrix-ai.png"\r\n\r\n' +
      LOGO_PNG_B64.replace(/(.{76})/g, '$1\r\n') + '\r\n' +
      '--' + rb + '--';
  }
  h.push('Content-Type: multipart/alternative; boundary="' + b + '"');
  return h.join('\r\n') + '\r\n\r\n' +
    '--' + b + '\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + part(o.body) + '\r\n' +
    '--' + b + '\r\n' + htmlPart + '\r\n' +
    '--' + b + '--';
}

function encodeHeader_(s) {
  s = String(s || '');
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  return '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?=';
}

function encodeName_(name) {
  if (/^[\x20-\x7e]*$/.test(name)) return '"' + String(name).replace(/["\\]/g, '') + '"';
  return encodeHeader_(name);
}

function inWindow_(tz, S) {
  var now = new Date();
  var day = Utilities.formatDate(now, tz, 'EEE');
  var hour = Number(Utilities.formatDate(now, tz, 'H'));
  var days = list_(S.SEND_DAYS || 'Mon,Tue,Wed,Thu,Fri').map(function (d) { return d.slice(0, 3); });
  return days.indexOf(day.toLowerCase().slice(0, 3)) >= 0 &&
    hour >= num_(S.SEND_START_HOUR, 9) && hour < num_(S.SEND_END_HOUR, 16);
}

function skip_(t, r, why) {
  note_(t, r, why);
  return false;
}

// ------------------------------------------------------------------ replies, bounces, unsubscribes

function runChecks_() {
  var S = settings_(), me = me_(), dnc = dncSet_();
  var t = table_(TAB.OUTREACH);
  for (var r = 2; r <= t.lastRow; r++) {
    var stage = String(t.get(r, 'stage'));
    var mailbox = String(t.get(r, 'mailbox')).toLowerCase();
    if (mailbox && mailbox !== me) continue;
    if (!t.get(r, 'thread_id')) continue;
    var watching = WATCH_STAGES.indexOf(stage) >= 0 ||
      (stage === 'replied' && t.get(r, 'reply_sent_at')); // conversation continues after our reply
    if (!watching) continue;
    try { checkThreadRow_(t, r, S, dnc); } catch (err) { log_('check_error', t.get(r, 'lead_id'), String(err).slice(0, 300)); }
  }
  checkBounces_(t, S, dnc);
  checkUnsubscribes_(t, S, dnc);
  checkBouncePause_(t, S);
}

/** Look for an inbound message on the row's thread. Returns true if a reply (not OOO) was found. */
function checkThreadRow_(t, r, S, dnc) {
  var thread = GmailApp.getThreadById(String(t.get(r, 'thread_id')));
  if (!thread) return false;
  var since = date_(t.get(r, 'reply_sent_at')) || date_(t.get(r, 'sent_1_at'));
  if (!since) return false;
  var ours = ourAddresses_(S);
  var lid = t.get(r, 'lead_id');
  var msgs = thread.getMessages();
  var sawOoo = false;
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    if (m.getDate() <= since) continue;
    var from = addr_(m.getFrom());
    if (ours.indexOf(from) >= 0) continue;
    if (/mailer-daemon|postmaster/i.test(from)) continue; // bounces are handled separately
    var text = stripQuoted_(m.getPlainBody() || '');
    var subj = m.getSubject() || '';
    var auto = String(m.getHeader('Auto-Submitted') || '').toLowerCase();
    if ((auto && auto !== 'no') || OOO_RE.test(subj) || OOO_RE.test(text.slice(0, 600))) { sawOoo = true; continue; }
    // A real reply.
    if (UNSUB_RE.test(text.slice(0, 400)) || /unsubscribe/i.test(subj)) {
      t.set(r, 'stage', 'dnc');
      t.set(r, 'replied_at', m.getDate());
      t.set(r, 'reply_label', 'unsubscribe');
      t.set(r, 'reply_text', text.slice(0, 2000));
      addDnc_(from, 'unsubscribe reply', 'checkTick', dnc);
      log_('unsubscribe', lid, from);
      return true;
    }
    var again = String(t.get(r, 'stage')) === 'replied';
    t.set(r, 'stage', 'replied');
    t.set(r, 'replied_at', m.getDate());
    t.set(r, 'reply_label', '');
    t.set(r, 'reply_text', (again ? '[new reply] ' : '') + text.slice(0, 2000));
    if (again) { t.set(r, 'reply_draft', ''); t.set(r, 'reply_decision', ''); t.set(r, 'reply_sent_at', ''); }
    log_('reply', lid, from);
    alert_('Reply from ' + t.get(r, 'company') + ' (' + from + ')',
      t.get(r, 'contact_name') + ' at ' + t.get(r, 'company') + ' replied:\n\n' + text.slice(0, 600) +
      '\n\nOpen the Sheet: ' + SpreadsheetApp.getActive().getUrl());
    return true;
  }
  if (sawOoo && WATCH_STAGES.indexOf(String(t.get(r, 'stage'))) >= 0 &&
      String(t.get(r, 'reply_label')) !== 'out_of_office') {
    t.set(r, 'reply_label', 'out_of_office');
    log_('out_of_office', lid, 'sequence continues');
  }
  return false;
}

function checkBounces_(t, S, dnc) {
  var label = getLabel_();
  var threads = GmailApp.search('from:(mailer-daemon OR postmaster) newer_than:2d -label:' + PROCESSED_LABEL, 0, 50);
  if (!threads.length) return;
  var byEmail = {};
  for (var r = 2; r <= t.lastRow; r++) {
    var e = String(t.get(r, 'email')).toLowerCase().trim();
    if (e && /^sent_|^finished$/.test(String(t.get(r, 'stage')))) byEmail[e] = r;
  }
  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var failed = String(m.getHeader('X-Failed-Recipients') || '') + ' ' + (m.getPlainBody() || '');
      var found = (failed.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [])
        .map(function (x) { return x.toLowerCase(); });
      found.forEach(function (e) {
        if (!(e in byEmail)) return;
        var r = byEmail[e];
        if (String(t.get(r, 'stage')) === 'bounced') return;
        t.set(r, 'stage', 'bounced');
        t.set(r, 'bounced_at', new Date());
        addDnc_(e, 'bounce', 'checkTick', dnc);
        log_('bounce', t.get(r, 'lead_id'), e);
      });
    });
    th.addLabel(label);
  });
}

function checkUnsubscribes_(t, S, dnc) {
  var label = getLabel_();
  var to = perAccount_(S.SEND_AS) || me_();
  var threads = GmailApp.search('to:' + to + ' subject:unsubscribe newer_than:7d -label:' + PROCESSED_LABEL, 0, 50);
  var ours = ourAddresses_(S);
  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var from = addr_(m.getFrom());
      if (!from || ours.indexOf(from) >= 0) return;
      addDnc_(from, 'unsubscribe email', 'checkTick', dnc);
      for (var r = 2; r <= t.lastRow; r++) {
        if (String(t.get(r, 'email')).toLowerCase() === from && String(t.get(r, 'stage')) !== 'dnc') {
          t.set(r, 'stage', 'dnc');
          t.set(r, 'reply_label', 'unsubscribe');
          log_('unsubscribe', t.get(r, 'lead_id'), from);
        }
      }
    });
    th.addLabel(label);
  });
}

function checkBouncePause_(t, S) {
  var c = todayCounts_(t);
  var pct = num_(S.BOUNCE_PAUSE_PCT, 3);
  if (c.sent >= 10 && (c.bounced / c.sent) * 100 > pct && !truthy_(S.SENDING_PAUSED)) {
    setSetting_('SENDING_PAUSED', 'TRUE');
    log_('auto_pause', '', c.bounced + ' bounces / ' + c.sent + ' sends today');
    alert_('Sending paused: bounces at ' + Math.round(c.bounced / c.sent * 100) + '%',
      c.bounced + ' bounces out of ' + c.sent + ' sends today. Sending is paused until you set SENDING_PAUSED to FALSE.');
  }
}

/** The most recent message on a thread that is not from us. */
function lastInbound_(threadId, S) {
  if (!threadId) return null;
  var th = Gmail.Users.Threads.get('me', threadId, { format: 'metadata', metadataHeaders: ['From', 'Message-ID', 'References'] });
  var ours = ourAddresses_(S);
  var msgs = (th.messages || []).slice().reverse();
  for (var i = 0; i < msgs.length; i++) {
    var hs = msgs[i].payload && msgs[i].payload.headers;
    var from = addr_(header_(hs, 'From'));
    if (from && ours.indexOf(from) < 0 && !/mailer-daemon|postmaster/i.test(from)) {
      return { from: from, messageId: header_(hs, 'Message-ID'), references: header_(hs, 'References') };
    }
  }
  return null;
}

function stripQuoted_(text) {
  var lines = String(text).replace(/\r/g, '').split('\n');
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^On .{5,200}wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l) ||
        /^_{5,}/.test(l) || (/^From:\s/.test(l) && i > 0) || /^Sent from my /i.test(l)) break;
    if (/^\s*>/.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ------------------------------------------------------------------ intake, summary, Customer.io

function dispatchIntake() {
  var S = settings_();
  dispatch_(S.INTAKE_WORKFLOW || 'intake.yml');
  var today = Utilities.formatDate(new Date(), IST, 'EEE').slice(0, 3).toLowerCase();
  if (today === String(S.AGENCIES_DAY || 'Mon').slice(0, 3).toLowerCase()) dispatch_(S.AGENCIES_WORKFLOW || 'agencies.yml');
}

function dispatch_(file) {
  var S = settings_();
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token || !S.GITHUB_OWNER) { log_('dispatch_error', '', 'GITHUB_TOKEN or GITHUB_OWNER missing'); return false; }
  var url = 'https://api.github.com/repos/' + S.GITHUB_OWNER + '/' + (S.GITHUB_REPO || 'tevrix-bd') +
    '/actions/workflows/' + file + '/dispatches';
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ ref: 'main' }),
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    muteHttpExceptions: true
  });
  var ok = res.getResponseCode() === 204;
  log_(ok ? 'dispatch' : 'dispatch_error', '', file + ' -> HTTP ' + res.getResponseCode() + (ok ? '' : ' ' + res.getContentText().slice(0, 200)));
  if (!ok) alert_('GitHub intake did not start (' + file + ')', 'HTTP ' + res.getResponseCode() + '\n' + res.getContentText().slice(0, 500));
  return ok;
}

function dailySummary() {
  var S = settings_(), t = table_(TAB.OUTREACH), c = todayCounts_(t);
  var drafts = 0, queued = 0, interested = 0;
  for (var r = 2; r <= t.lastRow; r++) {
    var st = String(t.get(r, 'stage'));
    if (st === 'drafted' && !t.get(r, 'decision')) drafts++;
    if (st === 'approved' && !t.get(r, 'sent_1_at')) queued++;
    if (String(t.get(r, 'reply_label')) === 'interested') interested++;
  }
  var body = [
    'HireMinds BD — ' + Utilities.formatDate(new Date(), IST, 'EEE d MMM yyyy'),
    '',
    'Drafts waiting for review: ' + drafts,
    'Approved, not yet sent: ' + queued,
    'Emails sent today: ' + c.sent,
    'Replies today: ' + c.replied,
    'Interested (all time): ' + interested,
    'Bounces today: ' + c.bounced,
    truthy_(S.SENDING_PAUSED) ? '\nSENDING IS PAUSED.' : '',
    truthy_(S.TEST_MODE) ? 'TEST_MODE is on: emails go to ' + S.TEST_RECIPIENT + '.' : '',
    '',
    SpreadsheetApp.getActive().getUrl()
  ].join('\n');
  alert_('HireMinds BD daily summary', body);
  log_('daily_summary', '', 'sent ' + c.sent + ', replies ' + c.replied);
}

function cioSync() {
  var S = settings_(), props = PropertiesService.getScriptProperties();
  var site = props.getProperty('CIO_SITE_ID'), key = props.getProperty('CIO_API_KEY');
  if (!site || !key) return;
  var host = String(S.CIO_REGION).toLowerCase() === 'eu' ? 'https://track-eu.customer.io' : 'https://track.customer.io';
  var auth = 'Basic ' + Utilities.base64Encode(site + ':' + key);
  var t = table_(TAB.OUTREACH);
  for (var r = 2; r <= t.lastRow; r++) {
    if (String(t.get(r, 'stage')) !== 'beta' || t.get(r, 'cio_synced_at')) continue;
    var email = String(t.get(r, 'email')).toLowerCase();
    if (!email) continue;
    var id = encodeURIComponent(email);
    var attrs = {
      email: email, name: t.get(r, 'contact_name'), company: t.get(r, 'company'), country: t.get(r, 'country'),
      stage: 'beta', created_at: Math.floor(Date.now() / 1000)
    };
    var opts = function (payload, method) {
      return { method: method, contentType: 'application/json', payload: JSON.stringify(payload),
        headers: { Authorization: auth }, muteHttpExceptions: true };
    };
    var a = UrlFetchApp.fetch(host + '/api/v1/customers/' + id, opts(attrs, 'put'));
    var b = UrlFetchApp.fetch(host + '/api/v1/customers/' + id + '/events',
      opts({ name: 'beta_started', data: { company: attrs.company } }, 'post'));
    if (a.getResponseCode() === 200 && b.getResponseCode() === 200) {
      t.set(r, 'cio_synced_at', new Date());
      log_('cio_sync', t.get(r, 'lead_id'), email);
    } else {
      log_('cio_error', t.get(r, 'lead_id'), 'identify ' + a.getResponseCode() + ', event ' + b.getResponseCode());
    }
  }
}

function sendTestEmail() {
  var S = settings_();
  var to = S.TEST_RECIPIENT || me_();
  var t = table_(TAB.OUTREACH), subject = 'HireMinds test', body = 'This is a test of the HireMinds BD sender.';
  for (var r = 2; r <= t.lastRow; r++) {
    if (t.get(r, 'email_1') && t.get(r, 'subject')) { subject = t.get(r, 'subject'); body = t.get(r, 'email_1'); break; }
  }
  var res = sendRaw_({ to: to, subject: '[TEST] ' + subject, body: withSignature_(String(body), S),
    html: htmlEmail_(String(body), S, { first: true }), S: S });
  log_('test_email', '', to + ' thread ' + res.threadId);
  toast_('Test email sent to ' + to + ' from ' + (perAccount_(S.SEND_AS) || me_()) + '.');
}

// ------------------------------------------------------------------ helpers: sheet

/** Header-indexed access to a tab. Rows are 1-based sheet rows (data starts at 2). */
function table_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing tab: ' + name);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var values = lastRow ? sh.getRange(1, 1, lastRow, lastCol).getValues() : [[]];
  var header = values[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  header.forEach(function (h, i) { if (h) idx[h] = i; });
  function ci(col) {
    if (!(col in idx)) throw new Error(name + ': no column "' + col + '"');
    return idx[col];
  }
  return {
    sheet: sh, header: header, lastRow: lastRow,
    col: function (col) { return ci(col) + 1; },
    get: function (r, col) { var v = values[r - 1] && values[r - 1][ci(col)]; return v === undefined || v === null ? '' : v; },
    set: function (r, col, v) {
      var c = ci(col);
      sh.getRange(r, c + 1).setValue(v);
      if (values[r - 1]) values[r - 1][c] = v;
    }
  };
}

function settings_() {
  if (settings_.cache) return settings_.cache;
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB.SETTINGS);
  var vals = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 2).getValues();
  var S = {};
  for (var i = 1; i < vals.length; i++) {
    var k = String(vals[i][0]).trim();
    if (k) S[k] = typeof vals[i][1] === 'string' ? vals[i][1].trim() : vals[i][1];
  }
  settings_.cache = S;
  return S;
}

function setSetting_(key, value) {
  var sh = SpreadsheetApp.getActive().getSheetByName(TAB.SETTINGS);
  var keys = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var i = 1; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) { sh.getRange(i + 1, 2).setValue(value); settings_.cache = null; return; }
  }
  sh.appendRow([key, value, '']);
  settings_.cache = null;
}

function dncSet_() {
  var t = table_(TAB.DNC), set = { emails: {}, domains: {} };
  for (var r = 2; r <= t.lastRow; r++) {
    var v = String(t.get(r, 'value')).trim().toLowerCase();
    if (!v) continue;
    if (v.charAt(0) === '@') set.domains[v.slice(1)] = true; else set.emails[v] = true;
  }
  return set;
}

function isDnc_(email, dnc) {
  email = String(email).toLowerCase();
  if (dnc.emails[email]) return true;
  var host = email.split('@')[1] || '';
  for (var d in dnc.domains) {
    if (host === d || host.slice(-(d.length + 1)) === '.' + d) return true;
  }
  return false;
}

function addDnc_(value, reason, source, dnc) {
  value = String(value).toLowerCase().trim();
  if (!value || (dnc && dnc.emails[value])) return;
  var t = table_(TAB.DNC);
  var row = t.header.map(function (h) {
    return { value: value, reason: reason, added_at: new Date(), source: source }[h] || '';
  });
  t.sheet.appendRow(row);
  if (dnc) dnc.emails[value] = true;
}

function note_(t, r, text) {
  var cur = String(t.get(r, 'reviewer_notes'));
  if (cur.indexOf(text) >= 0) return;
  t.set(r, 'reviewer_notes', cur ? cur + '\n' + text : text);
}

function log_(action, leadId, detail) {
  try {
    var t = table_(TAB.LOG);
    var data = { time: new Date(), mailbox: me_(), action: action, lead_id: leadId || '', detail: detail || '' };
    t.sheet.appendRow(t.header.map(function (h) { return h in data ? data[h] : ''; }));
  } catch (err) {
    console.error('log failed: ' + err);
  }
}

function todayCounts_(t) {
  var today = Utilities.formatDate(new Date(), IST, 'yyyy-MM-dd');
  var isToday = function (v) { var d = date_(v); return d && Utilities.formatDate(d, IST, 'yyyy-MM-dd') === today; };
  var c = { sent: 0, bounced: 0, replied: 0 };
  for (var r = 2; r <= t.lastRow; r++) {
    ['sent_1_at', 'sent_2_at', 'sent_3_at'].forEach(function (k) { if (isToday(t.get(r, k))) c.sent++; });
    if (isToday(t.get(r, 'bounced_at'))) c.bounced++;
    if (isToday(t.get(r, 'replied_at'))) c.replied++;
  }
  return c;
}

// ------------------------------------------------------------------ helpers: general

function me_() { return String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); }

/** "a@x.com" or "bd@x.com=team@out.com, raj@x.com=raj@out.com": the value for the running account. */
function perAccount_(value) {
  var s = String(value || '').trim();
  if (s.indexOf('=') < 0) return s;
  var me = me_(), fallback = '';
  s.split(',').forEach(function (pair) {
    var kv = pair.split('=');
    if (kv.length === 2 && kv[0].trim().toLowerCase() === me) fallback = kv[1].trim();
  });
  return fallback;
}

function ourAddresses_(S) {
  var list = [me_()];
  var sendAs = perAccount_(S.SEND_AS);
  if (sendAs) list.push(sendAs.toLowerCase());
  try { GmailApp.getAliases().forEach(function (a) { list.push(String(a).toLowerCase()); }); } catch (e) { /* no-op */ }
  return list;
}

function addr_(from) {
  var m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

function header_(headers, name) {
  var n = name.toLowerCase();
  for (var i = 0; headers && i < headers.length; i++) {
    if (String(headers[i].name).toLowerCase() === n) return headers[i].value;
  }
  return '';
}

function list_(v) {
  return String(v || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
}

function num_(v, d) { var n = Number(v); return isNaN(n) || v === '' ? d : n; }
function truthy_(v) { return v === true || /^(true|yes|1)$/i.test(String(v).trim()); }
function date_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function sentToday_() {
  var key = 'sent_' + Utilities.formatDate(new Date(), IST, 'yyyy-MM-dd');
  return Number(PropertiesService.getUserProperties().getProperty(key) || 0);
}

function bumpSentToday_() {
  var props = PropertiesService.getUserProperties();
  var key = 'sent_' + Utilities.formatDate(new Date(), IST, 'yyyy-MM-dd');
  props.setProperty(key, String(Number(props.getProperty(key) || 0) + 1));
  // Drop counters older than a week.
  var cutoff = Utilities.formatDate(new Date(Date.now() - 7 * 86400000), IST, 'yyyy-MM-dd');
  props.getKeys().forEach(function (k) { if (/^sent_\d{4}-\d{2}-\d{2}$/.test(k) && k.slice(5) < cutoff) props.deleteProperty(k); });
}

function getLabel_() { return GmailApp.getUserLabelByName(PROCESSED_LABEL) || GmailApp.createLabel(PROCESSED_LABEL); }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { log_('lock_busy', '', 'another run is in progress; skipped'); return; }
  try { fn(); } finally { lock.releaseLock(); }
}

function alert_(subject, body) {
  var S = settings_();
  var to = S.ALERT_EMAILS || me_();
  try { MailApp.sendEmail({ to: to, subject: subject, body: body, name: 'HireMinds BD' }); } catch (err) { console.error(err); }
  var hook = PropertiesService.getScriptProperties().getProperty('CHAT_WEBHOOK');
  if (hook) {
    try {
      UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ text: subject + '\n' + body.slice(0, 1500) }), muteHttpExceptions: true });
    } catch (err) { console.error(err); }
  }
}

function toast_(msg) {
  try { SpreadsheetApp.getActive().toast(msg, 'HireMinds BD', 6); } catch (e) { /* running from a trigger */ }
}

// Tevrix AI logo, 240x235 PNG (apps-script/assets/tevrix-logo.png), sent inline when LOGO_URL is blank.
var LOGO_CID = 'tevrixlogo';
var LOGO_PNG_B64 = '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';

// For tests under Node (ignored by Apps Script).
if (typeof module !== 'undefined') {
  module.exports = { HEADERS: HEADERS, COUNTRY_TZ: COUNTRY_TZ, stripQuoted_: stripQuoted_, OOO_RE: OOO_RE,
    UNSUB_RE: UNSUB_RE, addr_: addr_, list_: list_, isDnc_: isDnc_, encodeHeader_: encodeHeader_,
    htmlEmail_: htmlEmail_, withSignature_: withSignature_, buildRaw_: buildRaw_ };
}
