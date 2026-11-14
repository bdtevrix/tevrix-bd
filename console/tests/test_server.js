// Runs Web.gs against the fake Apps Script services. node tests/test_server.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const SRC = { fake: read('preview/fakegas.js'), sample: read('preview/sample.js'), web: read('../apps-script/Web.gs'), auto: read('preview/automation-fake.js') };

function boot(opts) {
  opts = opts || {};
  const ctx = vm.createContext({ console, Intl, Date, Math, JSON, Object, Array, String, Number, Boolean, Error, RegExp, encodeURIComponent, unescape });
  vm.runInContext(SRC.fake, ctx);
  vm.runInContext(SRC.sample, ctx);
  const env = vm.runInContext('__fakeGAS', ctx).install({
    sheets: vm.runInContext('__sample.sheets', ctx),
    activeUser: opts.user === undefined ? 'founder@tevrix.example' : opts.user,
    effectiveUser: 'bd@tevrix.example', editors: ['founder@tevrix.example', 'cofounder@tevrix.example']
  });
  vm.runInContext(SRC.web, ctx);
  if (opts.automation) vm.runInContext(SRC.auto, ctx);
  ctx.env = env;
  return ctx;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
function hasDate(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return true;
  if (v && typeof v === 'object') return Object.keys(v).some((k) => hasDate(v[k]));
  return false;
}
function sheet(ctx, name) { return ctx.env.sheets[name]; }
function rowOf(ctx, tab, leadId) {
  const d = sheet(ctx, tab).data, h = d[0], c = h.indexOf('lead_id');
  const r = d.find((x, i) => i > 0 && x[c] === leadId);
  return r ? Object.fromEntries(h.map((k, i) => [k, r[i]])) : null;
}
function firstWhere(ctx, pred) {
  const d = sheet(ctx, 'Outreach').data, h = d[0];
  for (let i = 1; i < d.length; i++) { const o = Object.fromEntries(h.map((k, j) => [k, d[i][j]])); if (pred(o)) return o; }
  return null;
}
const logCount = (ctx) => sheet(ctx, 'Log').getLastRow();

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('state loads, has no Date objects, counts make sense', () => {
  const c = boot();
  const s = c.uiGetState();
  const ids = s.outreach.map((o) => o.lead_id);
  assert.strictEqual(new Set(ids).size, ids.length, 'sample lead ids are unique');
  assert.ok(!hasDate(s), 'state must not contain Date objects');
  assert.strictEqual(s.me, 'founder@tevrix.example');
  const drafted = s.outreach.filter((o) => o.stage === 'drafted');
  assert.strictEqual(drafted.length, 6);
  assert.ok(drafted.every((o) => o._full && o.email_1), 'drafts carry their full text');
  const fin = s.outreach.find((o) => o.stage === 'finished');
  assert.ok(fin && !('email_1' in fin) && fin._full === false, 'closed rows are sent in short form');
  assert.strictEqual(s.metrics.repliesWaiting, 3);
  assert.strictEqual(s.metrics.approved, 2);
  assert.strictEqual(s.metrics.demos, 3, 'demo + beta count as demos');
  assert.ok(s.metrics.firstSent > 50 && s.metrics.replyRate > 0 && s.metrics.replyRate < 0.2);
  assert.strictEqual(s.gates.g1.demos30, 2);
  assert.strictEqual(s.gates.g3.committed, 1);
  assert.strictEqual(s.gates.g2.asked, 4, 'everyone but "Not a fit"');
  assert.strictEqual(s.actions.send.ready, false, 'automation not installed');
  assert.strictEqual(s.funnel, undefined);
  assert.strictEqual(s.metrics.funnel[0].key, 'found');
  assert.ok(typeof s.settings.TEST_MODE === 'boolean');
});

test('access: strangers are refused, DASHBOARD_USERS lets people in', () => {
  const c = boot({ user: 'stranger@other.example' });
  assert.throws(() => c.uiGetState(), /No access for stranger@other.example/);
  assert.match(c.doGet().getContent(), /No access for stranger@other.example/);
  const c2 = boot({ user: '' });
  assert.throws(() => c2.uiGetState(), /No access/);
  // Grant through Settings
  const c3 = boot({ user: 'helper@tevrix.example' });
  const set = sheet(c3, 'Settings').data;
  set.find((r) => r[0] === 'DASHBOARD_USERS')[1] = 'Helper@tevrix.example, other@x.example';
  c3.env.cache = {};
  assert.strictEqual(c3.uiGetState().me, 'helper@tevrix.example');
  assert.strictEqual(c3.doGet().getContent(), 'FILE:Dashboard');
  // Owner of the script always gets in
  const c4 = boot({ user: 'bd@tevrix.example' });
  assert.ok(c4.uiGetState());
});

test('approve: saves edits, sets stage, mailbox, time and logs', () => {
  const c = boot();
  const o = firstWhere(c, (x) => x.company === 'Northwind Freight');
  const before = logCount(c);
  const r = c.uiDecide(o.lead_id, 'approve', { subject: 'New subject line' });
  assert.ok(!hasDate(r));
  assert.strictEqual(r.stage, 'approved');
  const row = rowOf(c, 'Outreach', o.lead_id);
  assert.strictEqual(row.decision, 'approve');
  assert.strictEqual(row.subject, 'New subject line');
  assert.strictEqual(row.mailbox, 'team@tryhireminds.example');
  assert.ok(row.decided_at instanceof c.Date || Object.prototype.toString.call(row.decided_at) === '[object Date]');
  assert.strictEqual(logCount(c), before + 1);
  assert.throws(() => c.uiDecide(o.lead_id, 'approve'), /already marked "approved"/);
});

test('approve is refused for risky, missing and do-not-contact addresses', () => {
  const c = boot();
  const risky = firstWhere(c, (x) => x.company === 'Brightpath Learning');
  assert.throws(() => c.uiDecide(risky.lead_id, 'approve'), /"risky"/);
  const none = firstWhere(c, (x) => x.company === 'Cobalt Ledger');
  assert.throws(() => c.uiDecide(none.lead_id, 'approve'), /no email address/);
  const lumen = firstWhere(c, (x) => x.company === 'Lumen Dental Group');
  c.uiDncAdd('@lumendental.example', 'test');
  const after = rowOf(c, 'Outreach', lumen.lead_id);
  assert.strictEqual(after.stage, 'dnc', 'adding a domain stops open drafts');
  assert.throws(() => c.uiDecide(lumen.lead_id, 'approve'), /already marked "dnc"/);
});

test('skip and undo; undo refused after sending', () => {
  const c = boot();
  const o = firstWhere(c, (x) => x.company === 'Kestrel Robotics');
  c.uiDecide(o.lead_id, 'skip');
  assert.strictEqual(rowOf(c, 'Outreach', o.lead_id).stage, 'skipped');
  const back = c.uiUndo(o.lead_id);
  assert.strictEqual(back.stage, 'drafted');
  assert.strictEqual(back.decision, '');
  const sent = firstWhere(c, (x) => x.stage === 'sent_1');
  assert.throws(() => c.uiUndo(sent.lead_id), /already gone out/);
});

test('edits: allowed before sending, blocked after, unknown fields refused', () => {
  const c = boot();
  const o = firstWhere(c, (x) => x.stage === 'drafted' && x.email_status === 'safe');
  const r = c.uiSaveDraft(o.lead_id, { email_1: 'Shorter email?', reviewer_notes: 'Keep it shorter' });
  assert.strictEqual(r.email_1, 'Shorter email?');
  const sent = firstWhere(c, (x) => x.stage === 'sent_1');
  assert.throws(() => c.uiSaveDraft(sent.lead_id, { email_1: 'x' }), /already been sent/);
  assert.ok(c.uiSaveDraft(sent.lead_id, { follow_up_1: 'New follow up' }), 'follow-up 1 can still change');
  assert.throws(() => c.uiSaveDraft(o.lead_id, { email: 'x@y.z' }), /cannot be edited/);
  // Unchanged values are not errors even when locked
  assert.ok(c.uiSaveDraft(sent.lead_id, { email_1: sent.email_1 }));
});

test('text that looks like a formula is written as text', () => {
  const c = boot();
  const o = firstWhere(c, (x) => x.stage === 'drafted' && x.email_status === 'safe');
  c.uiSaveDraft(o.lead_id, { reviewer_notes: '- shorter\n- warmer' });
  const sh = sheet(c, 'Outreach');
  assert.strictEqual(sh.writes[sh.writes.length - 1], "'- shorter\n- warmer");
  assert.strictEqual(rowOf(c, 'Outreach', o.lead_id).reviewer_notes, '- shorter\n- warmer');
  const s = c.uiSetSetting('SIG_WHATSAPP', '+91 98765 43210');
  assert.strictEqual(s.SIG_WHATSAPP, '+91 98765 43210');
  c.uiSetSetting('DAILY_CAP_PER_MAILBOX', '-1');
  assert.strictEqual(c.uiGetState().settings.DAILY_CAP_PER_MAILBOX, -1, 'numbers stay numbers');
});

test('new rows land after the last real row, even with checkbox columns to row 1000', () => {
  const c = boot();
  const li = sheet(c, 'LinkedIn').data, h = li[0];
  const realRows = li.length;
  for (let k = li.length; k < 1000; k++) { const r = h.map(() => ''); r[h.indexOf('sent')] = false; r[h.indexOf('accepted')] = false; li.push(r); }
  const o = firstWhere(c, (x) => x.company === 'Brightpath Learning');
  c.uiToLinkedIn(o.lead_id);
  const at = li.findIndex((r) => r[h.indexOf('lead_id')] === o.lead_id);
  assert.strictEqual(at, realRows, 'written into the first empty row (sheet row ' + (realRows + 1) + ')');
  assert.strictEqual(li.length, 1000, 'no rows added at the bottom');
  const w = c.uiWaitlistAdd({ name: 'Formula Test', notes: '=HYPERLINK("x")' });
  assert.strictEqual(w.notes, '=HYPERLINK("x")', 'formula-looking text stays text');
});

test('label changes never move the stage', () => {
  const c = boot();
  const dm = firstWhere(c, (x) => x.stage === 'demo');
  const r = c.uiSetLabel(dm.lead_id, 'other');
  assert.strictEqual(r.stage, 'demo');
  assert.strictEqual(r.reply_label, 'other');
  assert.throws(() => c.uiSetLabel(dm.lead_id, 'spam'), /not a reply label/);
  const draft = firstWhere(c, (x) => x.stage === 'drafted');
  assert.throws(() => c.uiSetLabel(draft.lead_id, 'interested'), /not replied/);
});

test('the log is read from the end, and row numbers stay right', () => {
  const c = boot();
  const lg = sheet(c, 'Log').data;
  for (let k = 0; k < 2500; k++) lg.push([new Date(2026, 0, 1), 'system', 'old', '', 'old row ' + k]);
  const s = c.uiGetState();
  assert.strictEqual(s.log.length, 80);
  assert.strictEqual(s.log[0]._row, lg.length, 'newest row number is the last sheet row');
  assert.ok(s.settingNotes.TEST_MODE.length > 0, 'setting notes come through');
});

test('an empty Sheet still loads', () => {
  const c = boot();
  Object.keys(c.env.sheets).forEach((k) => { if (k !== 'Settings') c.env.sheets[k].data = [c.env.sheets[k].data[0]]; });
  const s = c.uiGetState();
  assert.strictEqual(s.outreach.length, 0);
  assert.strictEqual(s.metrics.replyRate, 0);
  const r = c.uiAddLead({ company: 'First Lead', website: 'first.example' });
  assert.ok(r.lead_id);
  assert.strictEqual(c.env.sheets.Leads.data.length, 2);
});

test('move to LinkedIn: adds one row, marks skipped, idempotent', () => {
  const c = boot();
  const o = firstWhere(c, (x) => x.company === 'Brightpath Learning');
  const n = sheet(c, 'LinkedIn').getLastRow();
  c.uiToLinkedIn(o.lead_id);
  c.uiToLinkedIn(o.lead_id);
  assert.strictEqual(sheet(c, 'LinkedIn').getLastRow(), n + 1);
  const li = rowOf(c, 'LinkedIn', o.lead_id);
  assert.match(li.search_link, /linkedin\.com\/search\/results\/people\/\?keywords=Sara%20Al%20Mansoori%20Brightpath/);
  assert.strictEqual(li.sent, false);
  const row = rowOf(c, 'Outreach', o.lead_id);
  assert.strictEqual(row.stage, 'skipped');
  assert.strictEqual(row.reviewer_notes, 'Moved to LinkedIn');
});

test('replies: save, queue, cancel, blocked once sent', () => {
  const c = boot();
  const o = firstWhere(c, (x) => x.stage === 'replied' && x.reply_label === 'interested' && x.reply_decision !== 'send');
  let r = c.uiReply(o.lead_id, 'Edited answer', 'save');
  assert.strictEqual(r.reply_draft, 'Edited answer');
  assert.strictEqual(r.reply_decision, '');
  r = c.uiReply(o.lead_id, 'Edited answer', 'send');
  assert.strictEqual(r.reply_decision, 'send');
  r = c.uiReply(o.lead_id, undefined, 'cancel');
  assert.strictEqual(r.reply_decision, '');
  assert.throws(() => c.uiReply(o.lead_id, '   ', 'send'), /Write an answer/);
  const done = firstWhere(c, (x) => x.reply_sent_at);
  assert.throws(() => c.uiReply(done.lead_id, 'x', 'send'), /already been sent/);
});

test('stages: label change, demo logged for the gate, dnc adds to list, bad stage refused', () => {
  const c = boot();
  const o = firstWhere(c, (x) => x.stage === 'replied');
  let r = c.uiSetStage(o.lead_id, 'replied', 'not_now');
  assert.strictEqual(r.reply_label, 'not_now');
  c.uiSetStage(o.lead_id, 'demo');
  assert.strictEqual(c.uiGetState().gates.g1.demos30, 3);
  c.uiSetStage(o.lead_id, 'dnc');
  const dnc = sheet(c, 'Do not contact').data.map((x) => x[0]);
  assert.ok(dnc.includes(String(o.email).toLowerCase()));
  assert.throws(() => c.uiSetStage(o.lead_id, 'sent_1'), /not a stage you can set/);
});

test('add lead: id is L- + SHA-1 of the domain, duplicates and bad input refused', () => {
  const c = boot();
  const r = c.uiAddLead({ company: 'Test Co', website: 'www.TestCo.example/careers', email: 'Boss@testco.example' });
  const want = 'L-' + crypto.createHash('sha1').update('testco.example').digest('hex').slice(0, 8);
  assert.strictEqual(r.lead_id, want);
  const row = rowOf(c, 'Leads', want);
  assert.strictEqual(row.domain, 'testco.example');
  assert.strictEqual(row.website, 'https://www.TestCo.example/careers');
  assert.strictEqual(row.status, 'new');
  assert.strictEqual(row.email, 'boss@testco.example');
  assert.match(row.notes, /Added by founder@tevrix.example/);
  assert.throws(() => c.uiAddLead({ company: 'Test Co' }), /already in the pipeline/);
  assert.throws(() => c.uiAddLead({ company: 'Other', website: 'testco.example' }), /already in the pipeline/);
  assert.throws(() => c.uiAddLead({ company: '' }), /company name/);
  assert.throws(() => c.uiAddLead({ company: 'Z', email: 'not-an-email' }), /does not look like/);
  assert.throws(() => c.uiAddLead({ company: 'Comp', email: 'jane@oldclient.example' }), /do-not-contact/);
  const noSite = c.uiAddLead({ company: 'Name Only Ltd' });
  assert.strictEqual(noSite.lead_id, 'L-' + crypto.createHash('sha1').update('nameonlyltd').digest('hex').slice(0, 8));
});

test('park and reopen a lead', () => {
  const c = boot();
  const s = c.uiGetState();
  const l = s.leads.find((x) => x.status === 'new');
  assert.strictEqual(c.uiSetLeadStatus(l.lead_id, 'parked').status, 'parked');
  assert.strictEqual(c.uiSetLeadStatus(l.lead_id, 'new').status, 'new');
  assert.throws(() => c.uiSetLeadStatus(l.lead_id, 'queued'), /new or parked/);
});

test('LinkedIn and waitlist updates check the row has not moved', () => {
  const c = boot();
  const s = c.uiGetState();
  const li = s.linkedin[0];
  const r = c.uiLinkedIn(li._row, li.name, { sent: true });
  assert.strictEqual(r.sent, true);
  assert.throws(() => c.uiLinkedIn(li._row, 'Someone Else', { sent: true }), /has moved/);
  assert.throws(() => c.uiLinkedIn(li._row, li.name, { name: 'x' }), /cannot be changed/);
  const w = c.uiWaitlistAdd({ name: 'New Founder', company: 'NewCo' });
  assert.strictEqual(w.stage, 'Asked');
  assert.strictEqual(w.channel, 'Instagram');
  const u = c.uiWaitlistUpdate(w._row, 'New Founder', { stage: 'Committed to pay' });
  assert.strictEqual(u.stage, 'Committed to pay');
  assert.strictEqual(c.uiGetState().gates.g3.committed, 2);
  assert.throws(() => c.uiWaitlistAdd({}), /name/);
});

test('settings: types are kept, bad numbers refused, unknown keys refused', () => {
  const c = boot();
  let s = c.uiSetSetting('TEST_MODE', 'false');
  assert.strictEqual(s.TEST_MODE, false);
  s = c.uiSetSetting('SENDING_PAUSED', true);
  assert.strictEqual(s.SENDING_PAUSED, true);
  s = c.uiSetSetting('DAILY_CAP_PER_MAILBOX', '15');
  assert.strictEqual(s.DAILY_CAP_PER_MAILBOX, 15);
  assert.throws(() => c.uiSetSetting('DAILY_CAP_PER_MAILBOX', 'lots'), /needs a number/);
  assert.throws(() => c.uiSetSetting('NOPE', '1'), /not in the Settings tab/);
  s = c.uiSetSetting('SENDER_NAME', '  Asha  ');
  assert.strictEqual(s.SENDER_NAME, 'Asha');
  c.env.cache.ui_allowed = 'founder@tevrix.example';
  c.uiSetSetting('DASHBOARD_USERS', 'a@b.example');
  assert.ok(!('ui_allowed' in c.env.cache), 'access cache cleared');
});

test('do-not-contact input is normalised', () => {
  const c = boot();
  assert.strictEqual(c.uiDncAdd('https://www.Example-Co.example/about').value, '@example-co.example');
  assert.strictEqual(c.uiDncAdd('Person@Example.example').value, 'person@example.example');
  assert.throws(() => c.uiDncAdd(''), /Add an email/);
  const n = sheet(c, 'Do not contact').getLastRow();
  c.uiDncAdd('person@example.example');
  assert.strictEqual(sheet(c, 'Do not contact').getLastRow(), n, 'no duplicate rows');
});

test('run buttons: clear error without Code.gs, call through with it', () => {
  const c = boot();
  assert.throws(() => c.uiRun('send'), /not installed in this project yet/);
  assert.throws(() => c.uiRun('format_disk'), /Unknown action/);
  const a = boot({ automation: true });
  assert.strictEqual(a.uiGetState().actions.send.ready, true);
  const before = a.uiGetState().metrics.approved;
  const r = a.uiRun('send');
  assert.match(r.message, /Sent 2 first emails and 1 answer to the test inbox/);
  assert.strictEqual(a.uiGetState().metrics.approved, before - 2);
  assert.match(a.uiRun('replies').message, /1 new reply/);
  assert.match(a.uiRun('intake').message, /3 new leads/);
});

test('every public function checks access', () => {
  const c = boot({ user: 'stranger@other.example' });
  const pub = ['uiGetState', 'uiGetRow', 'uiDecide', 'uiUndo', 'uiSaveDraft', 'uiToLinkedIn', 'uiReply', 'uiSetLabel', 'uiSetStage', 'uiAddLead', 'uiSetLeadStatus', 'uiLinkedIn', 'uiWaitlistAdd', 'uiWaitlistUpdate', 'uiDncAdd', 'uiSetSetting', 'uiRun', 'uiPlaybookDecide', 'uiPlaybookAdd'];
  pub.forEach((fn) => assert.throws(() => c[fn]('x', 'y', {}), /No access/, fn + ' must refuse strangers'));
  const names = Object.keys(c).filter((k) => /^ui[A-Z]\w*[^_]$/.test(k) && typeof c[k] === 'function');
  assert.deepStrictEqual(names.sort(), pub.slice().sort(), 'every ui* function that the page can call is in the access list');
});

test('Web.gs avoids syntax Apps Script projects often trip on', () => {
  const code = SRC.web.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/\/\/.*$/gm, '');
  assert.ok(!/\?\?|\?\./.test(code), 'no ?? or ?.');
  assert.ok(!/\bglobalThis\b/.test(code));
  assert.ok(!/function doPost\b/.test(code));
});

let failed = 0;
test('run buttons: message from the Log rows when Code.gs returns nothing', () => {
  const c = boot();
  // Stand-ins that behave like the real Code.gs: write Log rows, return undefined.
  vm.runInContext(`
    function lg(a, d) { SpreadsheetApp.getActive().getSheetByName('Log').appendRow([new Date(), 'bd@tevrix.example', a, 'L-1', d || '']); }
    function sendNow() { lg('sent_first', 'a@x.example | hi'); lg('sent_first', 'b@x.example | hi'); lg('sent_fu1', 'c'); lg('sent_reply', 'd'); }
    function checkNow() { lg('reply', 'a@x.example'); lg('bounce', 'z@x.example'); }
    function dispatchIntake() { lg('dispatch', 'intake.yml -> HTTP 204'); }
    function sendTestEmail() { lg('test_email', 'me@x.example thread 1'); }
  `, c);
  assert.match(c.uiRun('send').message, /^Sent 2 first emails, 1 follow-up, 1 answer/);
  assert.match(c.uiRun('replies').message, /1 new reply, 1 bounce/);
  assert.match(c.uiRun('intake').message, /Lead search started on GitHub/);
  assert.match(c.uiRun('test').message, /Test email sent to me@x.example/);
  vm.runInContext(`function sendNow() {}`, c);
  assert.match(c.uiRun('send').message, /Nothing was due/);
  vm.runInContext(`function checkNow() { lg('lock_busy', 'another run'); }`, c);
  assert.match(c.uiRun('replies').message, /already going/);
});

test('approve: Code.gs country rules and an existing mailbox are respected', () => {
  const c = boot();
  vm.runInContext(`var COUNTRY_TZ = { uk: 'Europe/London', australia: 'Australia/Sydney', germany: 'Europe/Berlin' };
    var NO_AUTO_SEND = ['germany']; var US_COUNTRIES = ['us'];`, c);
  const o = firstWhere(c, (x) => x.stage === 'drafted' && x.email_status === 'safe' && x.email);
  const sh = sheet(c, 'Outreach'), h = sh.data[0], r = sh.data.findIndex((x) => x[h.indexOf('lead_id')] === o.lead_id);
  sh.data[r][h.indexOf('country')] = 'Germany';
  assert.throws(() => c.uiDecide(o.lead_id, 'approve'), /by hand/);
  sh.data[r][h.indexOf('country')] = 'Narnia';
  assert.throws(() => c.uiDecide(o.lead_id, 'approve'), /does not know the country "Narnia"/);
  sh.data[r][h.indexOf('country')] = 'UK';
  sh.data[r][h.indexOf('email_source')] = 'finder';
  assert.throws(() => c.uiDecide(o.lead_id, 'approve'), /No proof that .* is real/);
  sh.data[r][h.indexOf('email_source')] = 'published';
  sh.data[r][h.indexOf('email_proof')] = '';
  assert.throws(() => c.uiDecide(o.lead_id, 'approve'), /no link in email_proof/);
  sh.data[r][h.indexOf('email_proof')] = 'https://example.example/contact';
  sh.data[r][h.indexOf('mailbox')] = 'second@tevrix.example';
  assert.strictEqual(c.uiDecide(o.lead_id, 'approve').mailbox, 'second@tevrix.example');
});

test('learning: skip reason saved, cleared on undo, and checked', () => {
  const c = boot();
  const o = firstWhere(c, (x) => x.stage === 'drafted' && !x.decision);
  const r = c.uiDecide(o.lead_id, 'skip', null, 'weak_hook');
  assert.strictEqual(r.skip_reason, 'weak_hook');
  assert.strictEqual(rowOf(c, 'Outreach', o.lead_id).skip_reason, 'weak_hook');
  assert.strictEqual(c.uiUndo(o.lead_id).skip_reason, '');
  assert.throws(() => c.uiDecide(o.lead_id, 'skip', null, 'because'), /not a skip reason/);
  assert.strictEqual(c.uiDecide(o.lead_id, 'skip').skip_reason, '');
});

test("learning: Claude's original draft is kept on the first edit only", () => {
  const c = boot();
  const o = firstWhere(c, (x) => x.stage === 'drafted' && !x.decision);
  c.uiSaveDraft(o.lead_id, { linkedin_note: 'Only the note' });
  assert.strictEqual(rowOf(c, 'Outreach', o.lead_id).original_email, '', 'a note edit is not a draft edit');
  c.uiSaveDraft(o.lead_id, { email_1: 'My rewrite' });
  const kept = JSON.parse(rowOf(c, 'Outreach', o.lead_id).original_email);
  assert.strictEqual(kept.email_1, o.email_1);
  assert.strictEqual(kept.subject, o.subject);
  c.uiSaveDraft(o.lead_id, { email_1: 'Second rewrite' });
  assert.strictEqual(JSON.parse(rowOf(c, 'Outreach', o.lead_id).original_email).email_1, o.email_1, 'still Claude\'s version');
});

test('learning: Playbook rules can be approved, rejected, retired and added', () => {
  const c = boot();
  const st = c.uiGetState();
  assert.strictEqual(st.hasPlaybook, true);
  const prop = st.playbook.find((r) => r.status === 'proposed');
  const a = c.uiPlaybookDecide(prop._row, prop.id, 'approved');
  assert.strictEqual(a.status, 'approved');
  assert.strictEqual(a.decided_by, 'founder@tevrix.example');
  assert.throws(() => c.uiPlaybookDecide(prop._row, 'P-wrong', 'approved'), /moved/);
  assert.throws(() => c.uiPlaybookDecide(prop._row, prop.id, 'deleted'), /not a Playbook status/);
  const added = c.uiPlaybookAdd({ type: 'writing', rule: 'Never mention funding in the subject line' });
  assert.strictEqual(added.status, 'approved');
  assert.strictEqual(added.source, 'founder');
  assert.throws(() => c.uiPlaybookAdd({ rule: '  ' }), /Write the rule/);
  assert.strictEqual(c.uiGetState().playbook[0].rule, 'Never mention funding in the subject line');
});

for (const [name, fn] of tests) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n       ')); }
}
console.log(failed ? `\n${failed} of ${tests.length} failed` : `\nall ${tests.length} passed`);
process.exit(failed ? 1 : 0);
