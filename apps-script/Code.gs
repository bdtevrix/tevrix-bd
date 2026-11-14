/**
 * Tevrix BD — the clock and the hands.
 * Bound to the Sheet "Tevrix BD — Outreach". Runs as each mailbox account (the BD account first).
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
    'reply_sent_at', 'bounced_at', 'cio_synced_at', 'skip_reason', 'original_email',
    'email_source', 'email_proof', 'verify_result', 'bounce_type'],
  'Leads': ['lead_id', 'found_at', 'source', 'segment', 'company', 'domain', 'website', 'country', 'company_size',
    'open_roles', 'roles_sample', 'signal', 'job_urls', 'ceo_name', 'contact_name', 'contact_title', 'email',
    'email_source', 'email_status', 'pattern', 'people_found', 'status', 'notes'],
  'LinkedIn': ['date', 'founder', 'name', 'title', 'company', 'search_link', 'note', 'sent', 'accepted', 'lead_id'],
  'Do not contact': ['value', 'reason', 'added_at', 'source'],
  'Log': ['time', 'mailbox', 'action', 'lead_id', 'detail'],
  // Rules Claude follows. The Monday report proposes rows; founders approve them in the console.
  'Playbook': ['id', 'added_at', 'type', 'rule', 'evidence', 'source', 'status', 'decided_at', 'decided_by'],
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
// Tevrix AI logo (144x135 JPEG) sent inside each email under the signature when Settings LOGO_URL is blank.
var LOGO_CID = 'tevrix-logo';
var LOGO_JPEG_B64 = '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';

var OOO_RE = /(out of (the )?office|automatic reply|auto[- ]?reply|autoreply|on (annual |parental |maternity |sick )?leave|away from (my|the) (desk|office)|limited access to (my )?e-?mail|currently (away|travelling|traveling|on holiday|on vacation)|on holiday|on vacation|will be back on|returning on)/i;
var UNSUB_RE = /(unsubscribe|remove me|take me off|opt[ -]?out|not interested|no thanks|no, thanks|do not (contact|email) me|don't (contact|email) me|^\s*stop\b)/im;

// ------------------------------------------------------------------ menu and onEdit

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Tevrix BD')
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
  if (paused) setSetting_('BOUNCE_COUNT_FROM', new Date()); // resume: the bounce brake starts on a clean slate
  if (paused) setSetting_('NEW_EMAILS_HELD', 'FALSE');
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
      if (!truthy_(S.NEW_EMAILS_HELD)) queue.push({ r: r, kind: 'first', p: 1 }); // the bounce brake holds new addresses
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
  if (US_COUNTRIES.indexOf(country) >= 0 && !String(S.POSTAL_ADDRESS).trim()) {
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
    if (!testMode) {
      var gate = addressGate_(t, r, email, S, dnc);
      if (!gate.ok) return backToReview_(t, r, gate.why);
    }
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
    html: htmlFor_(String(body), S),
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
    html: htmlFor_(String(t.get(r, 'reply_draft')), S, true),
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

/** The signature's parts, shared by the plain-text and HTML versions of an email. */
function sigParts_(S, isReply) {
  var wa = String(S.SIG_WHATSAPP || '').trim();
  if (wa.charAt(0) === '#') wa = ''; // a broken cell such as #ERROR! never reaches an email
  return {
    name: perAccount_(S.SENDER_NAME),
    title: perAccount_(S.SENDER_TITLE),
    company: String(S.COMPANY_LINE || '').trim(),
    email: perAccount_(S.SIG_EMAIL),
    website: String(S.SIG_WEBSITE || '').trim(),
    linkedin: String(S.SIG_LINKEDIN || '').trim(),
    whatsapp: wa && (isReply || truthy_(S.WHATSAPP_ON_ALL_EMAILS)) ? wa : '',
    optOut: isReply ? '' : "Not relevant? Reply 'no thanks' and I won't write again.",
    postal: String(S.POSTAL_ADDRESS || '').trim()
  };
}

function withSignature_(body, S, isReply) {
  var g = sigParts_(S, isReply);
  var lines = [String(body).replace(/\s+$/, ''), ''];
  lines.push(g.name);
  if (g.title) lines.push(g.title);
  if (g.company) lines.push(g.company);
  if (g.email) lines.push(g.email);
  if (g.website) lines.push(g.website);
  if (g.linkedin) lines.push('LinkedIn: ' + g.linkedin);
  if (g.whatsapp) lines.push('WhatsApp: ' + waUrl_(g.whatsapp));
  if (g.optOut) { lines.push(''); lines.push(g.optOut); }
  if (g.postal) lines.push(g.postal);
  return lines.join('\n');
}

/** The same email as HTML: the text, then the Tevrix logo with the sender's details below it. */
function htmlEmail_(body, S, isReply) {
  var g = sigParts_(S, isReply);
  var logo = String(S.LOGO_URL || '').trim();
  var paras = String(body).replace(/\s+$/, '').split(/\n\s*\n/).map(function (p) {
    return '<p style="margin:0 0 12px">' + esc_(p).replace(/\n/g, '<br>') + '</p>';
  }).join('');
  var link = function (url, label) {
    return '<a href="' + esc_(url) + '" style="color:#C2410C;text-decoration:none">' + esc_(label) + '</a>';
  };
  var sig = ['<img src="' + esc_(logo || 'cid:' + LOGO_CID) + '" width="72" height="68" alt="Tevrix AI" ' +
    'style="display:block;border:0;width:72px;height:68px;margin:0 0 8px">'];
  sig.push('<div style="font-weight:bold;color:#1F1F1F">' + esc_(g.name) + '</div>');
  if (g.title) sig.push('<div>' + esc_(g.title) + '</div>');
  if (g.company) sig.push('<div>' + esc_(g.company) + '</div>');
  if (g.email) sig.push('<div>' + link('mailto:' + g.email, g.email) + '</div>');
  var links = [];
  if (g.website) links.push(link(/^https?:/i.test(g.website) ? g.website : 'https://' + g.website, g.website.replace(/^https?:\/\//i, '')));
  if (g.linkedin) links.push(link(g.linkedin, 'LinkedIn'));
  if (g.whatsapp) links.push(link(waUrl_(g.whatsapp), 'WhatsApp'));
  if (links.length) sig.push('<div style="margin-top:4px">' + links.join(' &middot; ') + '</div>');
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1F1F1F">' + paras +
    '<div style="margin-top:18px;font-size:13px;line-height:1.45;color:#444444">' + sig.join('') + '</div>';
  var small = [g.optOut, g.postal].filter(Boolean).map(esc_);
  if (small.length) html += '<div style="margin-top:14px;font-size:11px;color:#888888">' + small.join('<br>') + '</div>';
  return html + '</div>';
}

/** "+91 85808 77736" or a wa.me link → a wa.me link. */
function waUrl_(v) {
  v = String(v || '').trim();
  return /^https?:/i.test(v) ? v : 'https://wa.me/' + v.replace(/\D/g, '');
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Plain text unless Settings PLAIN_TEXT_ONLY is TRUE: then the HTML version (and the logo) is left out. */
function htmlFor_(body, S, isReply) {
  return truthy_(S.PLAIN_TEXT_ONLY) ? null : htmlEmail_(body, S, isReply);
}

/** Gmail API send with a raw RFC 822 message. Returns {id, threadId, messageId}. */
function sendRaw_(o) {
  var from = perAccount_(o.S.SEND_AS) || me_();
  var name = perAccount_(o.S.SENDER_NAME);
  var raw = buildRaw_({
    from: from, fromName: name, to: o.to, subject: o.subject, body: o.body,
    html: o.html || null, inlineLogo: !!o.html && !String(o.S.LOGO_URL || '').trim(),
    inReplyTo: o.inReplyTo, references: o.references
  });
  var req = { raw: Utilities.base64EncodeWebSafe(raw, Utilities.Charset.UTF_8) };
  if (o.threadId) req.threadId = o.threadId;
  var sent = Gmail.Users.Messages.send(req, 'me');
  var meta = Gmail.Users.Messages.get('me', sent.id, { format: 'metadata', metadataHeaders: ['Message-ID'] });
  var mid = header_(meta.payload && meta.payload.headers, 'Message-ID');
  return { id: sent.id, threadId: sent.threadId, messageId: mid };
}

/** RFC 822 message: plain text alone, or text + HTML (multipart/alternative), with the logo inline when asked. */
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
  if (!o.html) {
    h.push('Content-Type: text/plain; charset=UTF-8');
    h.push('Content-Transfer-Encoding: base64');
    return h.join('\r\n') + '\r\n\r\n' + b64Lines_(Utilities.base64Encode(o.body, Utilities.Charset.UTF_8));
  }
  var id = Utilities.getUuid().replace(/-/g, '');
  var alt = 'alt_' + id, rel = 'rel_' + id;
  var altBody = '--' + alt + '\r\n' + textPart_('text/plain', o.body) + '\r\n' +
    '--' + alt + '\r\n' + textPart_('text/html', o.html) + '\r\n--' + alt + '--';
  if (!o.inlineLogo) {
    h.push('Content-Type: multipart/alternative; boundary="' + alt + '"');
    return h.join('\r\n') + '\r\n\r\n' + altBody;
  }
  h.push('Content-Type: multipart/related; boundary="' + rel + '"');
  return h.join('\r\n') + '\r\n\r\n' +
    '--' + rel + '\r\nContent-Type: multipart/alternative; boundary="' + alt + '"\r\n\r\n' + altBody + '\r\n' +
    '--' + rel + '\r\nContent-Type: image/jpeg; name="tevrix-logo.jpg"\r\nContent-Transfer-Encoding: base64\r\n' +
    'Content-ID: <' + LOGO_CID + '>\r\nContent-Disposition: inline; filename="tevrix-logo.jpg"\r\n\r\n' +
    b64Lines_(LOGO_JPEG_B64) + '\r\n--' + rel + '--';
}

function textPart_(type, content) {
  return 'Content-Type: ' + type + '; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
    b64Lines_(Utilities.base64Encode(content, Utilities.Charset.UTF_8));
}

function b64Lines_(b64) { return String(b64).replace(/(.{76})/g, '$1\r\n'); }

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

// ------------------------------------------------------------------ address gate (before every first email)
//
// Bounces come from addresses, so every new address must pass these checks before email 1 goes out:
//  1. proof: email_source is "published" (seen on the company's own site, page in email_proof) or "verified"
//     (a verification service said valid). Finder guesses bounced 2 times out of 3 in the first week.
//  2. the domain accepts email (MX record, via Google's public DNS).
//  3. if a ZEROBOUNCE_API_KEY Script Property is set, the address is checked with ZeroBounce first.
// A row that fails goes back to Review with the reason, so a founder can fix the address or skip the lead.
// Follow-ups skip the gate: they go to an address that already accepted email 1.

var EMAIL_RE = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
var PROOF_SOURCES = ['published', 'verified'];
var VERIFY_BLOCK = ['invalid', 'spamtrap', 'abuse', 'do_not_mail'];

function addressGate_(t, r, email, S, dnc) {
  if (!EMAIL_RE.test(email)) return { ok: false, why: '"' + email + '" is not a valid email address.' };
  var domain = email.split('@')[1];
  var source = t.has('email_source') ? String(t.get(r, 'email_source')).trim().toLowerCase() : '';
  var proof = t.has('email_proof') ? String(t.get(r, 'email_proof')).trim() : '';
  if (t.has('email_source') && !truthy_(S.ALLOW_UNPROVEN_EMAILS)) {
    if (PROOF_SOURCES.indexOf(source) < 0) {
      return { ok: false, why: 'No proof this address is real (email_source is "' + (source || 'blank') +
        '"). Set email_source to published and paste the page that shows it in email_proof, or skip the lead.' };
    }
    if (source === 'published' && !/^https?:\/\//i.test(proof)) {
      return { ok: false, why: 'email_source is published but email_proof has no link. Paste the page that shows ' + email + '.' };
    }
  }
  var mx = mxCheck_(domain);
  if (mx === 'none') return { ok: false, why: domain + ' does not accept email (no mail server found).' };
  var key = PropertiesService.getScriptProperties().getProperty('ZEROBOUNCE_API_KEY');
  if (key) {
    var v = zeroBounce_(email, key);
    if (t.has('verify_result')) t.set(r, 'verify_result', v.status + (v.sub ? ' / ' + v.sub : '') + ' (' +
      Utilities.formatDate(new Date(), IST, 'yyyy-MM-dd') + ')');
    if (VERIFY_BLOCK.indexOf(v.status) >= 0) {
      addDnc_(email, 'verifier: ' + v.status, 'address gate', dnc);
      return { ok: false, why: 'ZeroBounce says ' + email + ' is ' + v.status + (v.sub ? ' (' + v.sub + ')' : '') + '. Find another address or skip.' };
    }
    if (v.status !== 'valid' && source !== 'published' && v.status !== 'error') {
      return { ok: false, why: 'ZeroBounce could not confirm ' + email + ' (' + v.status + ') and it is not published on their site.' };
    }
  }
  return { ok: true };
}

/** 'ok', 'none' (domain takes no email) or 'unknown' (lookup failed: we do not block on our own error). */
function mxCheck_(domain) {
  var cache = CacheService.getScriptCache(), ck = 'mx_' + domain;
  var hit = cache.get(ck);
  if (hit) return hit;
  var res = 'unknown';
  try {
    var get = function (type) {
      var resp = UrlFetchApp.fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=' + type,
        { muteHttpExceptions: true });
      return resp.getResponseCode() === 200 ? JSON.parse(resp.getContentText()) : null;
    };
    var mx = get('MX');
    if (mx) {
      var answers = (mx.Answer || []).filter(function (a) { return a.type === 15; });
      var nullMx = answers.length === 1 && /^0\s+\.?$/.test(String(answers[0].data).trim());
      if (mx.Status === 3) res = 'none';                      // the domain does not exist
      else if (answers.length && !nullMx) res = 'ok';
      else if (nullMx) res = 'none';                          // RFC 7505: "this domain takes no email"
      else {
        var a = get('A');                                     // no MX: mail falls back to the A record
        res = a && (a.Answer || []).some(function (x) { return x.type === 1; }) ? 'ok' : 'none';
      }
    }
  } catch (err) {
    log_('mx_error', '', domain + ': ' + String(err).slice(0, 200));
  }
  if (res !== 'unknown') cache.put(ck, res, 21600);
  return res;
}

function zeroBounce_(email, key) {
  try {
    var resp = UrlFetchApp.fetch('https://api.zerobounce.net/v2/validate?api_key=' + encodeURIComponent(key) +
      '&email=' + encodeURIComponent(email) + '&ip_address=', { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return { status: 'error', sub: 'HTTP ' + resp.getResponseCode() };
    var j = JSON.parse(resp.getContentText());
    if (j.error) return { status: 'error', sub: String(j.error).slice(0, 80) };
    return { status: String(j.status || 'unknown').toLowerCase(), sub: String(j.sub_status || '') };
  } catch (err) {
    return { status: 'error', sub: String(err).slice(0, 80) };
  }
}

/** Send a draft back to Review (decision cleared) with the reason on top of its notes. */
function backToReview_(t, r, why) {
  t.set(r, 'decision', '');
  t.set(r, 'stage', 'drafted');
  note_(t, r, 'NOT SENT: ' + why);
  log_('address_blocked', t.get(r, 'lead_id'), String(t.get(r, 'email')) + ': ' + why);
  return false;
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

// Bounce types. Only real failures count towards the brake; delay notices and full mailboxes do not.
//   not_found  the address does not exist (5.1.1 and friends)       -> bounced, Do not contact
//   group      a group or list that refuses outside mail             -> bounced, Do not contact
//   blocked    refused as spam or by policy: a warning about OUR      -> bounced, Do not contact, alert now
//              reputation or setup, not about the address
//   other      any other permanent failure                           -> bounced, Do not contact
//   soft       delayed, mailbox full, try again later                -> logged only, the sequence carries on
var HARD_BOUNCES = ['not_found', 'group', 'blocked', 'other'];

function classifyBounce_(subject, text) {
  // Read only the explanation: the copy of our own message's headers below it says "dmarc=pass", "spam" etc.
  var expl = String(text).split(/-{3,}\s*original message\s*-{3,}|\n\s*(?:arc-|received:|x-received:|dkim-signature:|authentication-results:|return-path:|final-recipient:)/i)[0];
  var s = (String(subject) + '\n' + expl).toLowerCase();
  if (/\(delay\)|delivery (has been |is )?delayed|will (retry|keep trying)|temporar(il)?y|try again later|\b4\d\d[ -]4\.\d{1,3}\.\d{1,3}\b|mailbox (is )?full|over quota|quota exceeded|insufficient storage/.test(s)) {
    return 'soft';
  }
  if (/group you tried to contact|permission to post|not allowed to post|only members can post|restricted to members/.test(s)) return 'group';
  var notFound = /address not found|couldn.t be found|could not be found|does not exist|doesn.t exist|user unknown|unknown user|no such (user|recipient|mailbox)|invalid recipient|recipient (address )?rejected|mailbox unavailable|mailbox not found|\b5\d\d[ -]5\.1\.\d{1,3}\b/.test(s);
  if (!notFound && /\b5\d\d[ -]5\.7\.\d{1,3}\b|spam|blocked|blacklist|blocklist|reputation|rejected for policy|policy reasons|unauthenticated|not authori[sz]ed/.test(s)) return 'blocked';
  return notFound ? 'not_found' : 'other';
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
      if (!/mailer-daemon|postmaster/i.test(m.getFrom())) return;
      var body = m.getPlainBody() || '';
      var failed = String(m.getHeader('X-Failed-Recipients') || '') + ' ' + body;
      var found = (failed.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [])
        .map(function (x) { return x.toLowerCase(); });
      var type = classifyBounce_(m.getSubject(), body.slice(0, 3000));
      var seen = {};
      found.forEach(function (e) {
        if (!(e in byEmail) || seen[e]) return;
        seen[e] = true;
        var r = byEmail[e], lid = t.get(r, 'lead_id');
        if (type === 'soft') { log_('soft_bounce', lid, e + ' (delayed or mailbox full; the sequence carries on)'); return; }
        if (String(t.get(r, 'stage')) === 'bounced') return;
        t.set(r, 'stage', 'bounced');
        t.set(r, 'bounced_at', new Date());
        if (t.has('bounce_type')) t.set(r, 'bounce_type', type);
        addDnc_(e, 'bounce: ' + type, 'checkTick', dnc);
        log_('bounce', lid, e + ' (' + type + (t.has('email_source') ? ', source ' + (t.get(r, 'email_source') || 'unknown') : '') + ')');
        if (type === 'blocked') {
          alert_('Email to ' + t.get(r, 'company') + ' was refused as spam or by policy',
            'The receiving server refused the email to ' + e + ' as spam or by policy, not because the address is wrong. ' +
            'This is a warning about the sending address\'s reputation or setup. Check the message in Gmail (from mailer-daemon) ' +
            'and slow down new addresses until it is understood.\n\n' + body.slice(0, 1200));
        }
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

// Bounce brake. Looks at the last BOUNCE_WINDOW_DAYS days (default 7), not just today: at 5 sends a day a
// "10 sends today" rule could never trigger. Trips when there are BOUNCE_PAUSE_MIN+ bounces (default 2) and they
// are over BOUNCE_PAUSE_PCT of sends in the window. What it does is BOUNCE_ACTION:
//   hold_new (default)  stop first emails to new addresses (NEW_EMAILS_HELD = TRUE); follow-ups and replies to
//                       people whose address already worked keep going, since they cannot bounce the same way
//   alert               only email the founders
//   pause               stop all sending (SENDING_PAUSED = TRUE)
// Only bounces after BOUNCE_COUNT_FROM count, so after a founder releases it the old bounces do not trip it again.
function checkBouncePause_(t, S) {
  if (truthy_(S.SENDING_PAUSED)) return;
  var action = String(S.BOUNCE_ACTION || 'hold_new').trim().toLowerCase();
  if (action === 'hold_new' && truthy_(S.NEW_EMAILS_HELD)) return;
  var now = new Date();
  var w = bounceWindow_(t, S, now);
  if (!bounceTrips_(w, S)) return;
  var stamp = Utilities.formatDate(now, IST, 'yyyy-MM-dd HH:mm');
  var pctNow = Math.round(w.bounced / Math.max(w.sent, 1) * 100);
  var what;
  if (action === 'pause') {
    setSetting_('SENDING_PAUSED', 'TRUE');
    what = 'All sending is paused until you set SENDING_PAUSED to FALSE (or press Resume in the console).';
  } else if (action === 'alert') {
    what = 'Nothing was stopped (BOUNCE_ACTION is alert).';
  } else {
    setSetting_('NEW_EMAILS_HELD', 'TRUE');
    what = 'First emails to new addresses are on hold; follow-ups and replies keep going. ' +
      'Set NEW_EMAILS_HELD to FALSE in Settings to release them once you know why.';
  }
  setSetting_('BOUNCE_COUNT_FROM', stamp);
  log_('auto_' + (action === 'pause' ? 'pause' : action === 'alert' ? 'alert' : 'hold'), '',
    w.bounced + ' bounces / ' + w.sent + ' sends in ' + w.days + ' days (' + pctNow + '%): ' + w.emails.join(', '));
  alert_('Bounce alert: ' + w.bounced + ' bounces in ' + w.days + ' days',
    w.bounced + ' of the last ' + w.sent + ' emails bounced (' + pctNow + '%):\n' + w.emails.join('\n') + '\n\n' + what +
    '\n\nLook at where those addresses came from (email_source and email_proof in Outreach) before releasing.');
}

/** Sends and bounces since max(now - BOUNCE_WINDOW_DAYS, BOUNCE_COUNT_FROM). */
function bounceWindow_(t, S, now) {
  var days = num_(S.BOUNCE_WINDOW_DAYS, 7);
  var from = new Date(now.getTime() - days * 86400000);
  var reset = date_(S.BOUNCE_COUNT_FROM);
  if (reset && reset > from) from = reset;
  var inWin = function (v) { var d = date_(v); return d && d >= from && d <= now; };
  var w = { days: days, from: from, sent: 0, bounced: 0, emails: [] };
  for (var r = 2; r <= t.lastRow; r++) {
    ['sent_1_at', 'sent_2_at', 'sent_3_at'].forEach(function (k) { if (inWin(t.get(r, k))) w.sent++; });
    if (inWin(t.get(r, 'bounced_at'))) {
      w.bounced++;
      w.emails.push(String(t.get(r, 'email')) + (t.has && t.has('bounce_type') && t.get(r, 'bounce_type') ? ' (' + t.get(r, 'bounce_type') + ')' : ''));
    }
  }
  return w;
}

function bounceTrips_(w, S) {
  var min = num_(S.BOUNCE_PAUSE_MIN, 2), pct = num_(S.BOUNCE_PAUSE_PCT, 3);
  return w.bounced >= min && w.sent > 0 && (w.bounced / w.sent) * 100 > pct;
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
    'Tevrix BD — ' + Utilities.formatDate(new Date(), IST, 'EEE d MMM yyyy'),
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
  alert_('Tevrix BD daily summary', body);
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
  var t = table_(TAB.OUTREACH), subject = 'Tevrix BD test', body = 'This is a test of the Tevrix BD sender.';
  for (var r = 2; r <= t.lastRow; r++) {
    if (t.get(r, 'email_1') && t.get(r, 'subject')) { subject = t.get(r, 'subject'); body = t.get(r, 'email_1'); break; }
  }
  var res = sendRaw_({ to: to, subject: '[TEST] ' + subject, body: withSignature_(String(body), S),
    html: htmlFor_(String(body), S), S: S });
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
    has: function (col) { return col in idx; },
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
  try { MailApp.sendEmail({ to: to, subject: subject, body: body, name: 'Tevrix BD' }); } catch (err) { console.error(err); }
  var hook = PropertiesService.getScriptProperties().getProperty('CHAT_WEBHOOK');
  if (hook) {
    try {
      UrlFetchApp.fetch(hook, { method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ text: subject + '\n' + body.slice(0, 1500) }), muteHttpExceptions: true });
    } catch (err) { console.error(err); }
  }
}

function toast_(msg) {
  try { SpreadsheetApp.getActive().toast(msg, 'Tevrix BD', 6); } catch (e) { /* running from a trigger */ }
}

// For tests under Node (ignored by Apps Script).
if (typeof module !== 'undefined') {
  module.exports = { HEADERS: HEADERS, COUNTRY_TZ: COUNTRY_TZ, stripQuoted_: stripQuoted_, OOO_RE: OOO_RE,
    UNSUB_RE: UNSUB_RE, addr_: addr_, list_: list_, isDnc_: isDnc_, encodeHeader_: encodeHeader_,
    withSignature_: withSignature_, htmlEmail_: htmlEmail_, buildRaw_: buildRaw_, waUrl_: waUrl_ };
}
