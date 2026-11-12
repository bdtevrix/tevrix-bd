/**
 * Tevrix BD Console — server side of the dashboard web app.
 *
 * Lives in the Apps Script project bound to the "Tevrix BD — Outreach" Sheet,
 * next to the automation script (Code.gs). It only reads and writes the Sheet and,
 * for the Run buttons, calls the automation's public functions when they exist.
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as:      Me (the BD account)
 *   Who has access:  Anyone within tevrixai.com
 * Then only people who can edit the Sheet, plus anyone listed in
 * Settings > DASHBOARD_USERS, can open it.
 *
 * Every function the page calls starts with "ui" and checks access first.
 * Helpers end with "_" so the page cannot call them.
 */

var UI_TABS = {
  OUT: 'Outreach', LEADS: 'Leads', LI: 'LinkedIn', DNC: 'Do not contact',
  LOG: 'Log', SET: 'Settings', WAIT: 'Waitlist', PB: 'Playbook'
};
// Why a draft was skipped: the fastest signal for what Claude should stop drafting.
var UI_SKIP_REASONS = ['wrong_person', 'size', 'weak_hook', 'wrong_country', 'not_a_fit', 'other'];
var UI_PB_STATUS = { approved: 1, rejected: 1, retired: 1 };
var UI_PB_TYPES = ['segment', 'country', 'angle', 'writing', 'contact', 'example', 'other'];
var UI_FULL_STAGES = { drafted: 1, approved: 1, replied: 1 };
var UI_LONG_FIELDS = ['email_1', 'follow_up_1', 'follow_up_2', 'linkedin_note', 'dossier',
  'reviewer_notes', 'reply_text', 'reply_draft', 'subject', 'fit_reason'];
var UI_SET_STAGES = { replied: 1, demo: 1, beta: 1, won: 1, lost: 1, dnc: 1, finished: 1 };
var UI_LABELS = ['interested', 'not_now', 'wrong_person', 'unsubscribe', 'out_of_office', 'other'];
// Function names as they are in Code.gs. sendNow and checkNow are the menu versions of the timers'
// sendTick and checkTick: the same work, and sendNow ignores the send window while TEST_MODE is on.
// Code.gs functions return nothing, so uiRun builds the message from the Log rows the run wrote.
var UI_RUN = {
  intake: { fn: 'dispatchIntake', label: 'Find leads' },
  send: { fn: 'sendNow', label: 'Send due emails' },
  replies: { fn: 'checkNow', label: 'Check replies' },
  test: { fn: 'sendTestEmail', label: 'Send a test email' }
};
var UI_GATE_DUE = '2027-01-31';
// The global object, so the Run buttons can find the automation's functions in Code.gs.
var UI_ROOT = this;

// ---------------------------------------------------------------- entry

function doGet() {
  var me = uiUser_();
  if (!uiAllowed_(me)) {
    return HtmlService.createHtmlOutput(uiNoAccessHtml_(me))
      .setTitle('Tevrix BD Console')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('Tevrix BD Console')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------------------------------------------------------------- access

function uiUser_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function uiAllowed_(email) {
  if (!email) return false;
  var cache = CacheService.getScriptCache();
  var list = cache.get('ui_allowed');
  if (!list) {
    var ss = SpreadsheetApp.getActive();
    var set = {};
    try { ss.getEditors().forEach(function (u) { set[String(u.getEmail()).toLowerCase()] = 1; }); } catch (e) {}
    try { var o = ss.getOwner(); if (o) set[String(o.getEmail()).toLowerCase()] = 1; } catch (e) {}
    try { set[String(Session.getEffectiveUser().getEmail()).toLowerCase()] = 1; } catch (e) {}
    uiList_(uiSettings_().DASHBOARD_USERS).forEach(function (e) { set[e] = 1; });
    list = Object.keys(set).filter(Boolean).join(',');
    cache.put('ui_allowed', list, 600);
  }
  return list.split(',').indexOf(email) !== -1;
}

function uiGuard_() {
  var me = uiUser_();
  if (!uiAllowed_(me)) {
    throw new Error('No access for ' + (me || 'this account') +
      '. Ask a founder to share the Sheet with you or add you to DASHBOARD_USERS in Settings.');
  }
  return me;
}

function uiNoAccessHtml_(me) {
  var who = me ? me.replace(/[<>&"]/g, '') : 'this account';
  return '<div style="font:16px/1.5 system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#0B0B12">' +
    '<p style="font:500 12px/1 monospace;letter-spacing:.12em;text-transform:uppercase;color:#5A5866">Tevrix BD Console</p>' +
    '<h1 style="font-size:32px;line-height:1.05;letter-spacing:-.03em;margin:12px 0">No access for ' + who + '</h1>' +
    '<p>This console is open to people who can edit the Tevrix BD Sheet. Ask a founder to share the Sheet with you, ' +
    'or to add your address to <b>DASHBOARD_USERS</b> in the Settings tab, then reload this page.</p></div>';
}

// ---------------------------------------------------------------- sheet helpers

function uiTable_(name, tail) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('The "' + name + '" tab is missing from the Sheet.');
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (!lastRow || !lastCol) return { sh: sh, headers: [], col: {}, rows: [], offset: 0 };
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var start = 2;
  if (tail && lastRow - 1 > tail) start = lastRow - tail + 1;
  var rows = lastRow >= start ? sh.getRange(start, 1, lastRow - start + 1, lastCol).getValues() : [];
  var col = {};
  headers.forEach(function (h, i) { if (h) col[h] = i; });
  return { sh: sh, headers: headers, col: col, rows: rows, offset: start - 2 };
}

function uiIsDate_(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function uiVal_(v) {
  if (uiIsDate_(v)) return isNaN(v.getTime()) ? '' : v.toISOString();
  return v === null || v === undefined ? '' : v;
}

function uiObj_(t, i, fields) {
  var r = t.rows[i], o = { _row: i + 2 + (t.offset || 0) };
  (fields || t.headers).forEach(function (h) {
    if (h && t.col[h] !== undefined) o[h] = uiVal_(r[t.col[h]]);
  });
  return o;
}

function uiGet_(t, i, field) {
  var c = t.col[field];
  return c === undefined ? '' : t.rows[i][c];
}

function uiSet_(t, i, field, value) {
  var c = t.col[field];
  if (c === undefined) throw new Error('The "' + field + '" column is missing from the ' + t.sh.getName() + ' tab.');
  // Text that starts with = + - or @ would be read as a formula (#ERROR!). A leading apostrophe keeps it as text.
  t.sh.getRange(i + 2 + (t.offset || 0), c + 1).setValue(uiText_(value));
  t.rows[i][c] = value;
}

// Text that starts with = + - or @ would be read as a formula (#ERROR!). A leading apostrophe keeps it as text.
function uiText_(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v) && isNaN(Number(v))) ? "'" + v : v;
}

function uiFind_(t, leadId) {
  var c = t.col.lead_id;
  if (c === undefined) return -1;
  for (var i = 0; i < t.rows.length; i++) {
    if (String(t.rows[i][c]) === String(leadId)) return i;
  }
  return -1;
}

function uiRowFor_(t, leadId) {
  var i = uiFind_(t, leadId);
  if (i < 0) throw new Error('Could not find lead ' + leadId + '. Someone may have deleted the row; reload the console.');
  return i;
}

function uiBlank_(r) {
  for (var j = 0; j < r.length; j++) {
    var v = r[j];
    if (v !== '' && v !== false && v !== null && v !== undefined) return false;
  }
  return true;
}

/**
 * Writes a new row straight after the last real one. Checkbox columns hold FALSE all the way down
 * the tab, so appendRow() would put the row at the very bottom (row 1001 and so on).
 */
function uiAppend_(t, obj) {
  var width = 0;
  t.headers.forEach(function (h, j) { if (h) width = j + 1; });
  var row = t.headers.slice(0, width).map(function (h) { return obj.hasOwnProperty(h) ? obj[h] : ''; });
  var i = t.rows.length;
  while (i > 0 && uiBlank_(t.rows[i - 1])) i--;
  t.sh.getRange(i + 2 + (t.offset || 0), 1, 1, width).setValues([row.map(uiText_)]);
  while (row.length < t.headers.length) row.push('');
  t.rows[i] = row;
  return i;
}

function uiStr_(v) { return String(v === null || v === undefined ? '' : v).trim(); }

function uiList_(v) {
  return uiStr_(v).split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

function uiDay_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function uiToDate_(v) {
  if (uiIsDate_(v)) return isNaN(v.getTime()) ? null : v;
  if (!v) return null;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function uiDomain_(s) {
  s = uiStr_(s).toLowerCase();
  if (!s) return '';
  if (s.indexOf('@') !== -1 && s.indexOf('/') === -1) s = s.split('@')[1];
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  return s.split(/[\/?#:]/)[0];
}

function uiNorm_(s) { return uiStr_(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

/** L- + first 8 hex characters of SHA-1 of the lowercased domain (or normalised company name). */
function uiLeadId_(key) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, key, Utilities.Charset.UTF_8);
  var hex = bytes.slice(0, 4).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  return 'L-' + hex;
}

function uiSettings_() {
  var t = uiTable_(UI_TABS.SET), out = {};
  t.rows.forEach(function (r) {
    var k = uiStr_(r[t.col.key]);
    if (k) out[k] = uiVal_(r[t.col.value]);
  });
  return out;
}

function uiLog_(who, action, leadId, detail) {
  var sh = SpreadsheetApp.getActive().getSheetByName(UI_TABS.LOG);
  if (sh) sh.appendRow([new Date(), who, action, leadId || '', detail || '']);
}

function uiDncSet_() {
  var t = uiTable_(UI_TABS.DNC), set = {};
  t.rows.forEach(function (r) { var v = uiStr_(r[t.col.value]).toLowerCase(); if (v) set[v] = 1; });
  return set;
}

function uiIsDnc_(email, set) {
  email = uiStr_(email).toLowerCase();
  if (!email) return false;
  var dom = email.split('@')[1] || '';
  return !!(set[email] || (dom && (set['@' + dom] || set[dom])));
}

function uiLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function uiPickMailbox_(t) {
  var boxes = uiList_(uiSettings_().MAILBOXES);
  if (!boxes.length) return String(Session.getEffectiveUser().getEmail()).toLowerCase();
  var load = {};
  boxes.forEach(function (b) { load[b] = 0; });
  var active = { approved: 1, sent_1: 1, sent_2: 1 };
  t.rows.forEach(function (r) {
    var m = uiStr_(r[t.col.mailbox]).toLowerCase();
    if (load.hasOwnProperty(m) && active[uiStr_(r[t.col.stage])]) load[m]++;
  });
  var best = boxes[0];
  boxes.forEach(function (b) { if (load[b] < load[best]) best = b; });
  return best;
}

/**
 * The country checks Code.gs makes at send time (sendSequence_), made at approve time instead, so a draft
 * the sender would never send is not left sitting in Approved. Uses Code.gs's own tables when they exist.
 */
function uiSendable_(t, i, company) {
  var raw = uiStr_(uiGet_(t, i, 'country')), country = raw.toLowerCase();
  if (typeof COUNTRY_TZ !== 'undefined' && !COUNTRY_TZ[country]) {
    throw new Error('The sender does not know the country "' + raw + '" for ' + company + ', so it would never send. Fix the country first.');
  }
  if (typeof NO_AUTO_SEND !== 'undefined' && NO_AUTO_SEND.indexOf(country) !== -1) {
    throw new Error(company + ' is in Germany, Austria or the Netherlands. Email them by hand, or send it on LinkedIn.');
  }
  if (typeof US_COUNTRIES !== 'undefined' && US_COUNTRIES.indexOf(country) !== -1 && !uiStr_(uiSettings_().POSTAL_ADDRESS)) {
    throw new Error('US leads need POSTAL_ADDRESS in Settings before they can be emailed.');
  }
}

// Which draft fields may still change, given what has already gone out.
function uiEditable_(t, i) {
  var sent1 = !!uiGet_(t, i, 'sent_1_at'), sent2 = !!uiGet_(t, i, 'sent_2_at'),
      sent3 = !!uiGet_(t, i, 'sent_3_at'), replied = !!uiGet_(t, i, 'reply_sent_at');
  return {
    subject: !sent1, email_1: !sent1, follow_up_1: !sent2, follow_up_2: !sent3,
    linkedin_note: true, reviewer_notes: true, reply_draft: !replied
  };
}

/**
 * The first time a founder edits Claude's draft, keep Claude's version in original_email (JSON), so the Monday
 * report can compare what Claude wrote with what was sent and turn the differences into Playbook rules.
 */
function uiKeepOriginal_(t, i, edits) {
  if (t.col.original_email === undefined || uiStr_(uiGet_(t, i, 'original_email'))) return;
  var fields = ['subject', 'email_1', 'follow_up_1', 'follow_up_2'];
  var touched = fields.some(function (k) {
    return edits.hasOwnProperty(k) && String(uiGet_(t, i, k)) !== String(edits[k] === null || edits[k] === undefined ? '' : edits[k]);
  });
  if (!touched) return;
  var orig = {};
  fields.forEach(function (k) { orig[k] = String(uiGet_(t, i, k)); });
  uiSet_(t, i, 'original_email', JSON.stringify(orig));
}

function uiApplyEdits_(t, i, edits) {
  if (!edits) return [];
  var ok = uiEditable_(t, i), changed = [];
  uiKeepOriginal_(t, i, edits);
  Object.keys(edits).forEach(function (k) {
    if (!ok.hasOwnProperty(k)) throw new Error('"' + k + '" cannot be edited from the console.');
    var v = edits[k] === null || edits[k] === undefined ? '' : String(edits[k]);
    if (String(uiGet_(t, i, k)) === v) return;
    if (!ok[k]) throw new Error('That email has already been sent, so "' + k.replace(/_/g, ' ') + '" can no longer change.');
    uiSet_(t, i, k, v);
    changed.push(k);
  });
  return changed;
}

// ---------------------------------------------------------------- read

/** Everything the console shows, in one call. */
function uiGetState() {
  var me = uiGuard_();
  var ss = SpreadsheetApp.getActive();
  var settings = uiSettings_();
  var now = new Date(), today = uiDay_(now), d30 = new Date(now.getTime() - 30 * 864e5);

  var out = uiTable_(UI_TABS.OUT);
  var outreach = [];
  var compact = out.headers.filter(function (h) { return h && UI_LONG_FIELDS.indexOf(h) === -1; });
  out.rows.forEach(function (r, i) {
    if (!uiStr_(r[out.col.lead_id]) && !uiStr_(r[out.col.company])) return;
    var stage = uiStr_(r[out.col.stage]);
    var o = UI_FULL_STAGES[stage] ? uiObj_(out, i) : uiObj_(out, i, compact);
    o._full = !!UI_FULL_STAGES[stage];
    outreach.push(o);
  });

  var leadsT = uiTable_(UI_TABS.LEADS), leads = [];
  leadsT.rows.forEach(function (r, i) {
    if (!uiStr_(r[leadsT.col.company])) return;
    leads.push(uiObj_(leadsT, i));
  });
  // Newest first, at most 400 rows to keep the page quick.
  leads.reverse();
  leads = leads.slice(0, 400);

  var liT = uiTable_(UI_TABS.LI), linkedin = [];
  liT.rows.forEach(function (r, i) { if (uiStr_(r[liT.col.name])) linkedin.push(uiObj_(liT, i)); });
  linkedin.reverse();
  linkedin = linkedin.slice(0, 300);

  var waitlist = [];
  var wSheet = ss.getSheetByName(UI_TABS.WAIT);
  if (wSheet) {
    var wT = uiTable_(UI_TABS.WAIT);
    wT.rows.forEach(function (r, i) { if (uiStr_(r[wT.col.name])) waitlist.push(uiObj_(wT, i)); });
    waitlist.reverse();
  }

  var playbook = [];
  var pbSheet = ss.getSheetByName(UI_TABS.PB);
  if (pbSheet) {
    var pbT = uiTable_(UI_TABS.PB);
    pbT.rows.forEach(function (r, i) { if (uiStr_(r[pbT.col.rule])) playbook.push(uiObj_(pbT, i)); });
    playbook.reverse();
  }

  var dncT = uiTable_(UI_TABS.DNC), dnc = [];
  dncT.rows.forEach(function (r, i) { if (uiStr_(r[dncT.col.value])) dnc.push(uiObj_(dncT, i)); });
  dnc.reverse();

  var logT = uiTable_(UI_TABS.LOG, 2000), log = [], demoLog = {}, stageAt = {};
  logT.rows.forEach(function (r, i) {
    if (!r[logT.col.time] && !r[logT.col.action]) return;
    var action = uiStr_(r[logT.col.action]), detail = uiStr_(r[logT.col.detail]);
    var t = uiToDate_(r[logT.col.time]), lid = uiStr_(r[logT.col.lead_id]);
    if (action === 'stage' && detail === 'demo' && t && t >= d30) demoLog[lid] = 1;
    if (action === 'stage' && t && lid && (!stageAt[lid] || t > stageAt[lid])) stageAt[lid] = t;
    log.push(uiObj_(logT, i));
  });
  // When each lead last changed stage by hand, so the Pipeline can flag deals that have gone quiet.
  outreach.forEach(function (o) { if (stageAt[o.lead_id]) o.stage_at = stageAt[o.lead_id].toISOString(); });
  log.reverse();
  log = log.slice(0, 80);

  // ---- metrics
  var m = {
    byStage: {}, drafts: 0, approved: 0, inSequence: 0, repliesWaiting: 0,
    sentToday: 0, firstToday: 0, firstSent: 0, replies: 0, interested: 0, bounced: 0,
    demos: 0, beta: 0, won: 0, sent30: 0, replies30: 0
  };
  var angles = {}, countries = {};
  outreach.forEach(function (o) {
    var st = o.stage || 'drafted';
    m.byStage[st] = (m.byStage[st] || 0) + 1;
    if (st === 'drafted' && !o.decision) m.drafts++;
    if (st === 'approved') m.approved++;
    if (st === 'sent_1' || st === 'sent_2' || st === 'sent_3') m.inSequence++;
    if (st === 'replied' && !o.reply_sent_at) m.repliesWaiting++;
    ['sent_1_at', 'sent_2_at', 'sent_3_at'].forEach(function (k) {
      var d = uiToDate_(o[k]);
      if (d && uiDay_(d) === today) m.sentToday++;
    });
    var s1 = uiToDate_(o.sent_1_at), rp = uiToDate_(o.replied_at);
    if (s1) { m.firstSent++; if (uiDay_(s1) === today) m.firstToday++; if (s1 >= d30) m.sent30++; }
    if (rp) { m.replies++; if (rp >= d30) m.replies30++; }
    if (o.reply_label === 'interested') m.interested++;
    if (o.bounced_at) m.bounced++;
    var pastDemo = st === 'demo' || st === 'beta' || st === 'won';
    if (pastDemo) m.demos++;
    if (st === 'beta' || st === 'won') m.beta++;
    if (st === 'won') m.won++;

    var a = o.angle || 'No angle';
    var c = o.country || 'Unknown';
    [[angles, a], [countries, c]].forEach(function (pair) {
      var g = pair[0][pair[1]] || (pair[0][pair[1]] = { name: pair[1], sent: 0, replies: 0, interested: 0, demos: 0 });
      if (s1) g.sent++;
      if (rp) g.replies++;
      if (o.reply_label === 'interested') g.interested++;
      if (pastDemo) g.demos++;
    });
  });
  m.replyRate = m.firstSent ? m.replies / m.firstSent : 0;
  m.replyRate30 = m.sent30 ? m.replies30 / m.sent30 : 0;
  m.bounceRate = m.firstSent ? m.bounced / m.firstSent : 0;
  m.leadsNew = leads.filter(function (l) { return l.status === 'new'; }).length;
  m.leadsTotal = leadsT.rows.filter(function (r) { return uiStr_(r[leadsT.col.company]); }).length;
  m.linkedinToSend = linkedin.filter(function (l) { return l.sent !== true && String(l.sent).toUpperCase() !== 'TRUE'; }).length;
  m.funnel = [
    { key: 'found', label: 'Leads found', n: m.leadsTotal },
    { key: 'drafted', label: 'Drafted by Claude', n: outreach.length },
    { key: 'approved', label: 'Approved by you', n: outreach.filter(function (o) { return o.decision === 'approve'; }).length },
    { key: 'sent', label: 'First email sent', n: m.firstSent },
    { key: 'replied', label: 'Replied', n: m.replies },
    { key: 'demo', label: 'Demo booked', n: m.demos },
    { key: 'beta', label: 'Beta client', n: m.beta },
    { key: 'won', label: 'Paying', n: m.won }
  ];
  function rank(obj) {
    return Object.keys(obj).map(function (k) { return obj[k]; })
      .sort(function (a, b) { return b.sent - a.sent || b.replies - a.replies; }).slice(0, 12);
  }
  m.angles = rank(angles);
  m.countries = rank(countries);

  var committed = waitlist.filter(function (w) { return w.stage === 'Committed to pay'; }).length;
  var asked = waitlist.filter(function (w) { return w.stage !== 'Not a fit'; }).length;
  var gates = {
    due: UI_GATE_DUE,
    g1: { demos30: Object.keys(demoLog).length, demoTarget: 4, replyRate30: m.replyRate30, replyTarget: 0.03, sent30: m.sent30 },
    g2: { asked: asked, target: 10 },
    g3: { committed: committed, target: 2 }
  };

  var actions = {};
  Object.keys(UI_RUN).forEach(function (k) {
    actions[k] = { label: UI_RUN[k].label, ready: typeof UI_ROOT[UI_RUN[k].fn] === 'function' };
  });

  var setT = uiTable_(UI_TABS.SET), settingNotes = {};
  if (setT.col.notes !== undefined) setT.rows.forEach(function (r) { var k = uiStr_(r[setT.col.key]); if (k) settingNotes[k] = uiStr_(r[setT.col.notes]); });

  return {
    me: me, now: now.toISOString(), today: today, tz: Session.getScriptTimeZone(),
    sheetUrl: ss.getUrl(), settings: settings, settingNotes: settingNotes, metrics: m, gates: gates, actions: actions,
    outreach: outreach, leads: leads, linkedin: linkedin, waitlist: waitlist,
    hasWaitlist: !!wSheet, playbook: playbook, hasPlaybook: !!pbSheet, skipReasons: UI_SKIP_REASONS, dnc: dnc.slice(0, 100), dncCount: dnc.length, log: log
  };
}

/** One Outreach row with all its text (for rows the state call sends in short form). */
function uiGetRow(leadId) {
  uiGuard_();
  var t = uiTable_(UI_TABS.OUT);
  var i = uiRowFor_(t, leadId);
  var o = uiObj_(t, i);
  o._full = true;
  return o;
}

// ---------------------------------------------------------------- review

/** Approve or skip a draft. Edits made in the console are saved first. */
function uiDecide(leadId, decision, edits, reason) {
  var me = uiGuard_();
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.OUT);
    var i = uiRowFor_(t, leadId);
    var company = uiStr_(uiGet_(t, i, 'company'));
    var stage = uiStr_(uiGet_(t, i, 'stage'));
    if (stage && stage !== 'drafted') throw new Error(company + ' is already marked "' + stage + '". Reload to see the latest.');
    uiApplyEdits_(t, i, edits);
    if (decision === 'approve') {
      var email = uiStr_(uiGet_(t, i, 'email'));
      var status = uiStr_(uiGet_(t, i, 'email_status')).toLowerCase();
      if (!email) throw new Error(company + ' has no email address. Move it to the LinkedIn list instead.');
      if (status !== 'safe') throw new Error('The address for ' + company + ' is "' + (status || 'not checked') + '", so it will not be emailed. Move it to the LinkedIn list instead.');
      if (uiIsDnc_(email, uiDncSet_())) throw new Error(email + ' is on the do-not-contact list.');
      if (!uiStr_(uiGet_(t, i, 'subject')) || !uiStr_(uiGet_(t, i, 'email_1'))) throw new Error('Add a subject and a first email before approving.');
      uiSendable_(t, i, company);
      uiSet_(t, i, 'decision', 'approve');
      uiSet_(t, i, 'stage', 'approved');
      uiSet_(t, i, 'decided_at', new Date());
      // Same as onEdit in Code.gs: keep a mailbox that is already set.
      if (!uiStr_(uiGet_(t, i, 'mailbox'))) uiSet_(t, i, 'mailbox', uiPickMailbox_(t));
    } else if (decision === 'skip') {
      if (reason && UI_SKIP_REASONS.indexOf(reason) === -1) throw new Error('"' + reason + '" is not a skip reason.');
      uiSet_(t, i, 'decision', 'skip');
      uiSet_(t, i, 'stage', 'skipped');
      uiSet_(t, i, 'decided_at', new Date());
      if (t.col.skip_reason !== undefined) uiSet_(t, i, 'skip_reason', reason || '');
    } else {
      throw new Error('Unknown decision "' + decision + '".');
    }
    uiLog_(me, decision, leadId, company + (decision === 'skip' && reason ? ' · ' + reason : ''));
    var o = uiObj_(t, i); o._full = true;
    return o;
  });
}

/** Put an approved or skipped draft back in the review queue, if nothing has been sent. */
function uiUndo(leadId) {
  var me = uiGuard_();
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.OUT);
    var i = uiRowFor_(t, leadId);
    var stage = uiStr_(uiGet_(t, i, 'stage'));
    if (uiGet_(t, i, 'sent_1_at')) throw new Error('The first email has already gone out, so this cannot be undone.');
    if (stage !== 'approved' && stage !== 'skipped') throw new Error('Only approved or skipped drafts can go back to review.');
    uiSet_(t, i, 'decision', '');
    uiSet_(t, i, 'stage', 'drafted');
    uiSet_(t, i, 'decided_at', '');
    uiSet_(t, i, 'mailbox', '');
    if (t.col.skip_reason !== undefined) uiSet_(t, i, 'skip_reason', '');
    uiLog_(me, 'undo', leadId, uiStr_(uiGet_(t, i, 'company')));
    var o = uiObj_(t, i); o._full = true;
    return o;
  });
}

/** Save edits to a draft without deciding. */
function uiSaveDraft(leadId, edits) {
  var me = uiGuard_();
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.OUT);
    var i = uiRowFor_(t, leadId);
    var changed = uiApplyEdits_(t, i, edits);
    if (changed.length) uiLog_(me, 'edit', leadId, changed.join(', '));
    var o = uiObj_(t, i); o._full = true;
    return o;
  });
}

/** Skip the email and put the person on the LinkedIn list instead. */
function uiToLinkedIn(leadId) {
  var me = uiGuard_();
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.OUT);
    var i = uiRowFor_(t, leadId);
    var name = uiStr_(uiGet_(t, i, 'contact_name')), company = uiStr_(uiGet_(t, i, 'company'));
    var li = uiTable_(UI_TABS.LI);
    var exists = li.rows.some(function (r) { return uiStr_(r[li.col.lead_id]) === String(leadId); });
    if (!exists) {
      uiAppend_(li, {
        date: new Date(), founder: '', name: name || ('Someone at ' + company), title: uiStr_(uiGet_(t, i, 'contact_title')),
        company: company,
        search_link: 'https://www.linkedin.com/search/results/people/?keywords=' + encodeURIComponent((name + ' ' + company).trim()),
        note: uiStr_(uiGet_(t, i, 'linkedin_note')), sent: false, accepted: false, lead_id: leadId
      });
    }
    var stage = uiStr_(uiGet_(t, i, 'stage'));
    if (!stage || stage === 'drafted') {
      uiSet_(t, i, 'decision', 'skip');
      uiSet_(t, i, 'stage', 'skipped');
      uiSet_(t, i, 'decided_at', new Date());
    }
    var notes = uiStr_(uiGet_(t, i, 'reviewer_notes'));
    if (notes.indexOf('Moved to LinkedIn') === -1) uiSet_(t, i, 'reviewer_notes', (notes ? notes + '\n' : '') + 'Moved to LinkedIn');
    uiLog_(me, 'to_linkedin', leadId, company);
    var o = uiObj_(t, i); o._full = true;
    return o;
  });
}

// ---------------------------------------------------------------- replies and stages

/** Save, send (queue for the next send run) or cancel a reply. */
function uiReply(leadId, draft, action) {
  var me = uiGuard_();
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.OUT);
    var i = uiRowFor_(t, leadId);
    if (uiGet_(t, i, 'reply_sent_at')) throw new Error('This answer has already been sent.');
    if (typeof draft === 'string') uiApplyEdits_(t, i, { reply_draft: draft });
    if (action === 'send') {
      if (!uiStr_(uiGet_(t, i, 'reply_draft'))) throw new Error('Write an answer before sending.');
      if (uiIsDnc_(uiGet_(t, i, 'email'), uiDncSet_())) throw new Error('This address is on the do-not-contact list.');
      uiSet_(t, i, 'reply_decision', 'send');
    } else if (action === 'cancel') {
      uiSet_(t, i, 'reply_decision', '');
    }
    uiLog_(me, 'reply_' + (action || 'save'), leadId, uiStr_(uiGet_(t, i, 'company')));
    var o = uiObj_(t, i); o._full = true;
    return o;
  });
}

/** Correct how a reply was read, without moving the lead's stage. */
function uiSetLabel(leadId, label) {
  var me = uiGuard_();
  if (UI_LABELS.indexOf(label) === -1) throw new Error('"' + label + '" is not a reply label.');
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.OUT);
    var i = uiRowFor_(t, leadId);
    if (!uiGet_(t, i, 'replied_at') && uiStr_(uiGet_(t, i, 'stage')) !== 'replied') throw new Error('This lead has not replied yet.');
    uiSet_(t, i, 'reply_label', label);
    uiLog_(me, 'label', leadId, uiStr_(uiGet_(t, i, 'company')) + ' · ' + label);
    var o = uiObj_(t, i); o._full = true;
    return o;
  });
}

/** Move a lead along: demo booked, beta client, paying, lost, do not contact. */
function uiSetStage(leadId, stage, label) {
  var me = uiGuard_();
  if (!UI_SET_STAGES[stage]) throw new Error('"' + stage + '" is not a stage you can set from the console.');
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.OUT);
    var i = uiRowFor_(t, leadId);
    uiSet_(t, i, 'stage', stage);
    if (label !== undefined && t.col.reply_label !== undefined) uiSet_(t, i, 'reply_label', label);
    if (stage === 'dnc') {
      var email = uiStr_(uiGet_(t, i, 'email')).toLowerCase();
      if (email && !uiIsDnc_(email, uiDncSet_())) {
        uiAppend_(uiTable_(UI_TABS.DNC), { value: email, reason: 'Marked in console', added_at: new Date(), source: me });
      }
    }
    uiLog_(me, 'stage', leadId, stage);
    var o = uiObj_(t, i); o._full = true;
    return o;
  });
}

// ---------------------------------------------------------------- leads

/** Add a lead by hand (a referral, an inbound message). Claude researches it on the next run. */
function uiAddLead(lead) {
  var me = uiGuard_();
  lead = lead || {};
  var company = uiStr_(lead.company);
  if (!company) throw new Error('Add the company name.');
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.LEADS);
    var email = uiStr_(lead.email).toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('"' + email + '" does not look like an email address.');
    var domain = uiDomain_(lead.website) || uiDomain_(email);
    var key = domain || uiNorm_(company);
    var dupe = t.rows.some(function (r) {
      return (domain && uiStr_(r[t.col.domain]).toLowerCase() === domain) || uiNorm_(r[t.col.company]) === uiNorm_(company);
    });
    if (!dupe) {
      var o = uiTable_(UI_TABS.OUT);
      dupe = o.rows.some(function (r) { return uiNorm_(r[o.col.company]) === uiNorm_(company); });
    }
    if (dupe) throw new Error(company + ' is already in the pipeline.');
    if (email && uiIsDnc_(email, uiDncSet_())) throw new Error(email + ' is on the do-not-contact list.');
    var id = uiLeadId_(key);
    var website = uiStr_(lead.website);
    if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
    uiAppend_(t, {
      lead_id: id, found_at: new Date(), source: 'manual', segment: uiStr_(lead.segment), company: company,
      domain: domain, website: website, country: uiStr_(lead.country), signal: uiStr_(lead.signal),
      contact_name: uiStr_(lead.contact_name), contact_title: uiStr_(lead.contact_title), email: email,
      email_source: email ? 'manual' : 'none', email_status: email ? 'safe' : '',
      status: 'new', notes: (uiStr_(lead.notes) ? uiStr_(lead.notes) + ' · ' : '') + 'Added by ' + me
    });
    uiLog_(me, 'add_lead', id, company);
    return { lead_id: id };
  });
}

/** Park a lead (Claude skips it) or put it back as new. */
function uiSetLeadStatus(leadId, status) {
  var me = uiGuard_();
  if (status !== 'new' && status !== 'parked') throw new Error('A lead can only be set to new or parked here.');
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.LEADS);
    var i = uiRowFor_(t, leadId);
    uiSet_(t, i, 'status', status);
    uiLog_(me, 'lead_' + status, leadId, uiStr_(uiGet_(t, i, 'company')));
    return uiObj_(t, i);
  });
}

// ---------------------------------------------------------------- LinkedIn and waitlist

function uiCheckRow_(t, row, field, expect) {
  var i = row - 2;
  if (i < 0 || i >= t.rows.length || uiStr_(t.rows[i][t.col[field]]) !== uiStr_(expect)) {
    throw new Error('That row has moved in the Sheet. Reload the console and try again.');
  }
  return i;
}

function uiLinkedIn(row, name, patch) {
  var me = uiGuard_();
  var allowed = { sent: 1, accepted: 1, founder: 1, note: 1 };
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.LI);
    var i = uiCheckRow_(t, row, 'name', name);
    Object.keys(patch || {}).forEach(function (k) {
      if (!allowed[k]) throw new Error('"' + k + '" cannot be changed here.');
      uiSet_(t, i, k, patch[k]);
    });
    uiLog_(me, 'linkedin', uiStr_(uiGet_(t, i, 'lead_id')), name + ': ' + Object.keys(patch || {}).map(function (k) { return k + '=' + patch[k]; }).join(', '));
    return uiObj_(t, i);
  });
}

function uiWaitlistAdd(w) {
  var me = uiGuard_();
  w = w || {};
  if (!uiStr_(w.name)) throw new Error('Add the person\'s name.');
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.WAIT);
    var i = uiAppend_(t, {
      date: new Date(), name: uiStr_(w.name), company: uiStr_(w.company), role: uiStr_(w.role),
      country: uiStr_(w.country), channel: uiStr_(w.channel) || 'Instagram',
      what_they_asked: uiStr_(w.what_they_asked), stage: 'Asked', notes: uiStr_(w.notes)
    });
    uiLog_(me, 'waitlist_add', '', uiStr_(w.name) + (w.company ? ' (' + uiStr_(w.company) + ')' : ''));
    return uiObj_(t, i);
  });
}

function uiWaitlistUpdate(row, name, patch) {
  var me = uiGuard_();
  var allowed = { stage: 1, notes: 1, what_they_asked: 1, company: 1, role: 1, country: 1, channel: 1 };
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.WAIT);
    var i = uiCheckRow_(t, row, 'name', name);
    Object.keys(patch || {}).forEach(function (k) {
      if (!allowed[k]) throw new Error('"' + k + '" cannot be changed here.');
      uiSet_(t, i, k, patch[k]);
    });
    uiLog_(me, 'waitlist', '', name + ': ' + Object.keys(patch || {}).join(', '));
    return uiObj_(t, i);
  });
}

// ---------------------------------------------------------------- playbook

/** Approve or reject a proposed rule, or retire an approved one. Claude follows approved rules from its next run. */
function uiPlaybookDecide(row, id, status) {
  var me = uiGuard_();
  if (!UI_PB_STATUS[status]) throw new Error('"' + status + '" is not a Playbook status.');
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.PB);
    var i = uiCheckRow_(t, row, 'id', id);
    uiSet_(t, i, 'status', status);
    if (t.col.decided_at !== undefined) uiSet_(t, i, 'decided_at', new Date());
    if (t.col.decided_by !== undefined) uiSet_(t, i, 'decided_by', me);
    uiLog_(me, 'playbook_' + status, '', id + ': ' + uiStr_(uiGet_(t, i, 'rule')).slice(0, 120));
    return uiObj_(t, i);
  });
}

/** A founder adds a rule directly. It is approved straight away. */
function uiPlaybookAdd(p) {
  var me = uiGuard_();
  p = p || {};
  var rule = uiStr_(p.rule);
  if (!rule) throw new Error('Write the rule first.');
  var type = UI_PB_TYPES.indexOf(uiStr_(p.type)) !== -1 ? uiStr_(p.type) : 'other';
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.PB);
    var now = new Date();
    var id = 'F-' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyMMdd-HHmmss');
    var i = uiAppend_(t, {
      id: id, added_at: now, type: type, rule: rule, evidence: uiStr_(p.evidence) || 'Founder', source: 'founder',
      status: 'approved', decided_at: now, decided_by: me
    });
    uiLog_(me, 'playbook_add', '', id + ': ' + rule.slice(0, 120));
    return uiObj_(t, i);
  });
}

// ---------------------------------------------------------------- do not contact

/** Add an email address, or a whole company as @domain, to the do-not-contact list. */
function uiDncAdd(value, reason) {
  var me = uiGuard_();
  var v = uiStr_(value).toLowerCase();
  if (!v) throw new Error('Add an email address or a domain.');
  if (v.indexOf('@') === -1) v = '@' + uiDomain_(v);
  else if (v.charAt(0) !== '@' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error('"' + v + '" does not look like an email address.');
  return uiLock_(function () {
    var set = uiDncSet_();
    if (!set[v]) uiAppend_(uiTable_(UI_TABS.DNC), { value: v, reason: uiStr_(reason) || 'Added in console', added_at: new Date(), source: me });
    var t = uiTable_(UI_TABS.OUT), hit = 0, open = { drafted: 1, approved: 1, sent_1: 1, sent_2: 1, sent_3: 1 };
    var probe = {}; probe[v] = 1;
    t.rows.forEach(function (r, i) {
      if (open[uiStr_(r[t.col.stage])] && uiIsDnc_(r[t.col.email], probe)) { uiSet_(t, i, 'stage', 'dnc'); hit++; }
    });
    uiLog_(me, 'dnc_add', '', v + (hit ? ' (stopped ' + hit + ')' : ''));
    return { value: v, stopped: hit };
  });
}

// ---------------------------------------------------------------- settings and actions

function uiSetSetting(key, value) {
  var me = uiGuard_();
  return uiLock_(function () {
    var t = uiTable_(UI_TABS.SET), idx = -1;
    t.rows.forEach(function (r, i) { if (uiStr_(r[t.col.key]) === key) idx = i; });
    if (idx < 0) throw new Error('"' + key + '" is not in the Settings tab.');
    var cur = uiGet_(t, idx, 'value'), v = value;
    if (typeof cur === 'boolean' || key === 'SENDING_PAUSED' || key === 'TEST_MODE') {
      v = value === true || String(value).toUpperCase() === 'TRUE';
    } else if (typeof cur === 'number') {
      if (value === '' || isNaN(Number(value))) throw new Error(key + ' needs a number.');
      v = Number(value);
    } else {
      v = uiStr_(value);
    }
    uiSet_(t, idx, 'value', v);
    if (key === 'DASHBOARD_USERS') CacheService.getScriptCache().remove('ui_allowed');
    // Resuming starts the bounce brake on a clean slate: bounces from before the pause have been dealt with.
    if (key === 'SENDING_PAUSED' && v === false) {
      t.rows.forEach(function (r, i) {
        if (uiStr_(r[t.col.key]) === 'BOUNCE_COUNT_FROM') uiSet_(t, i, 'value', new Date());
      });
    }
    uiLog_(me, 'setting', '', key + ' = ' + (/KEY|TOKEN|SECRET/.test(key) ? '••••' : v));
    return uiSettings_();
  });
}

/** Run one automation step now (the same functions the timers run). */
function uiRun(action) {
  var me = uiGuard_();
  var spec = UI_RUN[action];
  if (!spec) throw new Error('Unknown action "' + action + '".');
  var fn = UI_ROOT[spec.fn];
  if (typeof fn !== 'function') {
    throw new Error(spec.label + ' arrives with the automation script (Code.gs). It is not installed in this project yet.');
  }
  var logSheet = SpreadsheetApp.getActive().getSheetByName(UI_TABS.LOG);
  var start = logSheet ? logSheet.getLastRow() : 0;
  var result = fn();
  var message = (result && result.message) || uiRunSummary_(action, logSheet, start) || (spec.label + ': done.');
  uiLog_(me, 'run', '', spec.label);
  return { ok: true, message: message };
}

/** Reads the Log rows a Code.gs run wrote (sent_first, reply, dispatch and so on) and says what happened. */
function uiRunSummary_(action, sh, start) {
  var n = {}, last = {};
  if (sh && sh.getLastRow() > start) {
    var width = sh.getLastColumn();
    var head = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return uiStr_(h); });
    var ai = head.indexOf('action'), di = head.indexOf('detail');
    sh.getRange(start + 1, 1, sh.getLastRow() - start, width).getValues().forEach(function (r) {
      var a = uiStr_(r[ai]);
      n[a] = (n[a] || 0) + 1;
      if (di !== -1) last[a] = uiStr_(r[di]);
    });
  }
  function c(k) { return n[k] || 0; }
  function many(x, one, more) { return x + ' ' + (x === 1 ? one : more); }
  if (c('lock_busy')) return 'Another run was already going, so this one was skipped. Try again in a minute.';
  var s = uiSettings_();
  if (action === 'send') {
    if (String(s.SENDING_PAUSED).toUpperCase() === 'TRUE' || s.SENDING_PAUSED === true) return 'Sending is paused, so nothing went out.';
    if (c('send_blocked')) return 'Nothing sent: ' + last.send_blocked + '.';
    var parts = [];
    if (c('sent_first')) parts.push(many(c('sent_first'), 'first email', 'first emails'));
    if (c('sent_fu1') + c('sent_fu2')) parts.push(many(c('sent_fu1') + c('sent_fu2'), 'follow-up', 'follow-ups'));
    if (c('sent_reply')) parts.push(many(c('sent_reply'), 'answer', 'answers'));
    var test = String(s.TEST_MODE).toUpperCase() === 'TRUE' || s.TEST_MODE === true;
    var msg = parts.length ? 'Sent ' + parts.join(', ') + (test ? ' to the test inbox.' : '.')
      : 'Nothing was due. Emails go out on ' + (s.SEND_DAYS || 'weekdays') + ' between ' + (s.SEND_START_HOUR || 9) +
        ':00 and ' + (s.SEND_END_HOUR || 16) + ':00 in each lead\'s time zone, up to ' + (s.DAILY_CAP_PER_MAILBOX || 20) + ' a day.';
    if (c('cap_reached')) msg += ' Today\'s cap is used up.';
    if (c('send_error')) msg += ' ' + many(c('send_error'), 'send failed', 'sends failed') + ': see the Log tab.';
    return msg;
  }
  if (action === 'replies') {
    var got = [];
    if (c('reply')) got.push(many(c('reply'), 'new reply', 'new replies'));
    if (c('unsubscribe')) got.push(many(c('unsubscribe'), 'unsubscribe', 'unsubscribes'));
    if (c('bounce')) got.push(many(c('bounce'), 'bounce', 'bounces'));
    if (c('out_of_office')) got.push(many(c('out_of_office'), 'out-of-office', 'out-of-offices'));
    var out = got.length ? got.join(', ') + '.' : 'No new replies, bounces or unsubscribes.';
    if (c('auto_pause')) out += ' Sending is now paused because of bounces: ' + last.auto_pause + '.';
    if (c('check_error')) out += ' ' + many(c('check_error'), 'thread', 'threads') + ' could not be read: see the Log tab.';
    return out;
  }
  if (action === 'intake') {
    if (c('dispatch_error')) return 'GitHub did not start the lead search: ' + last.dispatch_error;
    if (c('dispatch')) return 'Lead search started on GitHub' + (c('dispatch') > 1 ? ', with the Monday agencies search' : '') +
      '. New leads reach the Leads tab in about 40 minutes.';
  }
  if (action === 'test' && c('test_email')) return 'Test email sent to ' + last.test_email + '.';
  return '';
}
