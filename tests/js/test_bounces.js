// Bounce protection in Code.gs: address gate, bounce types, brake. Run: node tests/js/test_bounces.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8');
let fails = 0;
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; }

function load(fake = {}) {
  const logs = [], settings = {}, dncAdded = [], alerts = [];
  const ctx = {
    console,
    Utilities: { formatDate: (d) => new Date(d).toISOString().slice(0, 16).replace('T', ' ') },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (fake.props || {})[k] || null }) },
    UrlFetchApp: { fetch: (url) => {
      const body = fake.fetch ? fake.fetch(url) : { code: 200, json: {} };
      return { getResponseCode: () => body.code, getContentText: () => JSON.stringify(body.json) };
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.log_ = (a, l, d) => logs.push([a, l, d]);
  ctx.setSetting_ = (k, v) => { settings[k] = v; };
  ctx.addDnc_ = (v) => dncAdded.push(v);
  ctx.alert_ = (s) => alerts.push(s);
  return { ctx, logs, settings, dncAdded, alerts };
}
function table(rows) {
  const cols = new Set(['email', 'email_source', 'email_proof', 'verify_result', 'stage', 'decision', 'reviewer_notes',
    'lead_id', 'sent_1_at', 'sent_2_at', 'sent_3_at', 'bounced_at', 'bounce_type', 'company']);
  return { lastRow: rows.length + 1, has: (c) => cols.has(c), get: (r, k) => (rows[r - 2] || {})[k] || '',
    set: (r, k, v) => { rows[r - 2][k] = v; } };
}
const mx = (answers, status = 0) => ({ code: 200, json: { Status: status, Answer: answers } });
const dnsOk = (url) => /type=MX/.test(url) ? mx([{ type: 15, data: '10 mx.example.com.' }]) : mx([]);
const noDnc = { emails: {}, domains: {} };

// ---------------------------------------------------------------- address gate
{
  const { ctx } = load({ fetch: dnsOk });
  const g = (row, S = {}) => ctx.addressGate_(table([row]), 2, row.email, S, noDnc);
  check(g({ email: 'hr@evergreencare.ie', email_source: 'published', email_proof: 'https://www.evergreencare.ie/careers/' }).ok,
    'published address with a proof link passes');
  check(!g({ email: 'abhiarora@joinfleek.com', email_source: 'finder' }).ok, 'email-finder address is stopped (Fleek case)');
  check(!g({ email: 'pat.drea@autoboland.com', email_source: '' }).ok, 'address with no source is stopped (Auto Boland case)');
  check(!g({ email: 'x@y.com', email_source: 'published', email_proof: '' }).ok, 'published without a proof link is stopped');
  check(!g({ email: 'not an email', email_source: 'published', email_proof: 'https://a.b' }).ok, 'malformed address is stopped');
  check(g({ email: 'a@b.com', email_source: 'finder' }, { ALLOW_UNPROVEN_EMAILS: 'TRUE' }).ok, 'ALLOW_UNPROVEN_EMAILS lets a founder override');
}
{
  const { ctx } = load({ fetch: (url) => /type=MX/.test(url) ? mx([], 3) : mx([]) });
  const row = { email: 'hr@deadcompany.example', email_source: 'published', email_proof: 'https://x.y' };
  const r = ctx.addressGate_(table([row]), 2, row.email, {}, noDnc);
  check(!r.ok && /does not accept email/.test(r.why), 'domain that does not exist is stopped');
}
{
  const { ctx } = load({ fetch: (url) => /type=MX/.test(url) ? mx([{ type: 15, data: '0 .' }]) : mx([]) });
  const row = { email: 'a@nullmx.example', email_source: 'published', email_proof: 'https://x.y' };
  check(!ctx.addressGate_(table([row]), 2, row.email, {}, noDnc).ok, 'domain that publishes "no email" (null MX) is stopped');
}
{
  const { ctx } = load({ fetch: () => ({ code: 500, json: {} }) });
  const row = { email: 'a@b.com', email_source: 'published', email_proof: 'https://x.y' };
  check(ctx.addressGate_(table([row]), 2, row.email, {}, noDnc).ok, 'a DNS outage on our side does not block a good address');
}
{
  const zb = (status) => (url) => /zerobounce/.test(url) ? { code: 200, json: { status, sub_status: '' } } : dnsOk(url);
  let L = load({ fetch: zb('invalid'), props: { ZEROBOUNCE_API_KEY: 'k' } });
  let row = { email: 'a@b.com', email_source: 'published', email_proof: 'https://x.y' };
  check(!L.ctx.addressGate_(table([row]), 2, row.email, {}, noDnc).ok && L.dncAdded.includes('a@b.com'),
    'verifier "invalid" stops the send and adds the address to Do not contact');
  L = load({ fetch: zb('valid'), props: { ZEROBOUNCE_API_KEY: 'k' } });
  row = { email: 'a@b.com', email_source: 'verified' };
  check(L.ctx.addressGate_(table([row]), 2, row.email, {}, noDnc).ok && /valid/.test(row.verify_result), 'verifier "valid" passes and is recorded');
  L = load({ fetch: zb('catch-all'), props: { ZEROBOUNCE_API_KEY: 'k' } });
  row = { email: 'a@b.com', email_source: 'verified' };
  check(!L.ctx.addressGate_(table([row]), 2, row.email, {}, noDnc).ok, 'catch-all that is not published is stopped');
  L = load({ fetch: zb('catch-all'), props: { ZEROBOUNCE_API_KEY: 'k' } });
  row = { email: 'a@b.com', email_source: 'published', email_proof: 'https://x.y' };
  check(L.ctx.addressGate_(table([row]), 2, row.email, {}, noDnc).ok, 'catch-all that is published on their site passes');
}
{
  const { ctx, logs } = load({ fetch: dnsOk });
  const row = { email: 'a@b.com', decision: 'approve', stage: 'approved', reviewer_notes: '', lead_id: 'L-1' };
  ctx.note_ = (t, r, x) => { row.reviewer_notes += x; };
  ctx.backToReview_(table([row]), 2, 'No proof.');
  check(row.stage === 'drafted' && row.decision === '' && /NOT SENT: No proof/.test(row.reviewer_notes) && logs[0][0] === 'address_blocked',
    'a stopped draft goes back to Review with the reason');
}

// ---------------------------------------------------------------- bounce types (real messages from this inbox)
{
  const { ctx } = load();
  const c = (s, b) => ctx.classifyBounce_(s, b);
  check(c('Delivery Status Notification (Failure)', "Address not found\nYour message wasn't delivered to abhiarora@joinfleek.com because the address couldn't be found or is unable to receive email. The response was: 550 5.1.1 The email account that you tried to reach does not exist.") === 'not_found', 'Fleek: not_found');
  check(c('Delivery Status Notification (Failure)', "Hello panshul@team.tevrixai.com,\n\nWe're writing to let you know that the group you tried to contact (recruiting) may not exist, or you may not have permission to post messages to the group.\n\n----- Original message -----\nARC-Authentication-Results: i=2; mx.google.com; dmarc=pass (p=NONE)") === 'group', 'Duffel: group (and the copied "dmarc=pass" header is ignored)');
  check(c('Delivery Status Notification (Delay)', 'Delivery incomplete. There was a temporary problem delivering your message. Gmail will retry for 46 more hours.') === 'soft', 'delay notice: soft, not a bounce');
  check(c('Delivery Status Notification (Failure)', 'The response from the remote server was: 552 5.2.2 The email account that you tried to reach is over quota.') === 'soft', 'mailbox full: soft');
  check(c('Delivery Status Notification (Failure)', 'The response was: 550 5.7.1 Message rejected due to spam content. Our system has detected that this message is likely unsolicited mail.') === 'blocked', 'spam rejection: blocked');
  check(c('Undeliverable: hello', "Remote Server returned '550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup'") === 'not_found', 'Outlook 5.1.10: not_found');
  check(c('Undelivered Mail Returned to Sender', 'Received: from 10.4.1.2 by mx\nsomething odd happened') === 'other', 'unknown failure: other (and an IP in headers is not read as a 4.x.x code)');
}

// ---------------------------------------------------------------- brake
const d = (s) => new Date(s), now = d('2026-11-12T08:30:00Z');
const realWeek = () => table([
  { email: 'pat.drea@autoboland.com', sent_1_at: d('2026-11-10T11:26Z'), bounced_at: d('2026-11-10T11:30Z'), bounce_type: 'not_found' },
  { email: 'careers@muzz.com', sent_1_at: d('2026-11-11T09:11Z') },
  { email: 'abhiarora@joinfleek.com', sent_1_at: d('2026-11-11T09:11Z'), bounced_at: d('2026-11-11T09:30Z'), bounce_type: 'not_found' },
  { email: 'saurabh.gupta@cityfurnish.com', sent_1_at: d('2026-11-11T03:41Z') },
  { email: 'recruiting@duffel.com', sent_1_at: d('2026-11-11T12:56Z'), bounced_at: d('2026-11-11T13:30Z'), bounce_type: 'group' },
  { email: 'andrew@circuithub.com', sent_1_at: d('2026-11-11T12:56Z') },
]);
{
  const { ctx } = load();
  const S = { BOUNCE_PAUSE_PCT: '2' };
  let w = ctx.bounceWindow_(realWeek(), S, now);
  check(w.sent === 6 && w.bounced === 3 && ctx.bounceTrips_(w, S), 'the real first week trips the brake (3 of 6)');
  w = ctx.bounceWindow_(table([{ email: 'a@x.com', sent_1_at: d('2026-11-11T09:00Z'), bounced_at: d('2026-11-11T09:05Z') }, { email: 'b@y.com', sent_1_at: d('2026-11-11T09:00Z') }]), S, now);
  check(!ctx.bounceTrips_(w, S), 'a single bounce does not trip it');
  w = ctx.bounceWindow_(realWeek(), Object.assign({ BOUNCE_COUNT_FROM: d('2026-11-12T08:45Z') }, S), d('2026-11-13T08:00Z'));
  check(w.bounced === 0, 'after release, old bounces do not count');
  w = ctx.bounceWindow_(realWeek(), S, d('2026-11-19T12:00Z'));
  check(w.bounced === 0, 'bounces older than 7 days drop out');
  const many = (n, b) => table(Array.from({ length: n }, (_, i) => ({ email: i + '@x.com', sent_1_at: d('2026-11-11T09:00Z'), bounced_at: i < b ? d('2026-11-11T10:00Z') : '' })));
  check(ctx.bounceTrips_(ctx.bounceWindow_(many(60, 2), S, now), S), '2 in 60 (3.3%) trips it');
  check(!ctx.bounceTrips_(ctx.bounceWindow_(many(200, 2), S, now), S), '2 in 200 (1%) does not');
}
for (const [action, expect] of [['', 'NEW_EMAILS_HELD'], ['hold_new', 'NEW_EMAILS_HELD'], ['pause', 'SENDING_PAUSED'], ['alert', null]]) {
  const L = load();
  L.ctx.Date = Date;
  const realNow = Date.now; Date.now = () => now.getTime();
  const S = { BOUNCE_PAUSE_PCT: '2', BOUNCE_ACTION: action, BOUNCE_COUNT_FROM: '' };
  // checkBouncePause_ uses new Date(): run inside the window
  const t = realWeek();
  const win = L.ctx.bounceWindow_(t, S, now);
  L.ctx.bounceWindow_ = () => win;
  L.ctx.checkBouncePause_(t, S);
  Date.now = realNow;
  const did = expect ? L.settings[expect] === 'TRUE' : !L.settings.NEW_EMAILS_HELD && !L.settings.SENDING_PAUSED;
  check(did && L.alerts.length === 1 && L.settings.BOUNCE_COUNT_FROM, 'BOUNCE_ACTION "' + (action || 'default') + '" ' +
    (expect === 'NEW_EMAILS_HELD' ? 'holds new addresses only' : expect ? 'pauses everything' : 'only alerts') + ', and resets the count');
}
{
  const L = load();
  const t = realWeek();
  L.ctx.checkBouncePause_(t, { BOUNCE_PAUSE_PCT: '2', NEW_EMAILS_HELD: 'TRUE' });
  check(L.alerts.length === 0, 'no repeat alert while new addresses are already held');
}

console.log(fails ? fails + ' failed' : 'all bounce protection checks passed');
process.exit(fails ? 1 : 0);
