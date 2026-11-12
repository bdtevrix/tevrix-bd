// Runs the bounce brake from Code.gs against a fake Outreach table. node tests/js/test_bounce_brake.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8');
const ctx = { console, Utilities: { formatDate: (d) => d.toISOString().slice(0, 16).replace('T', ' ') } };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const H = ['email', 'sent_1_at', 'sent_2_at', 'sent_3_at', 'bounced_at'];
function table(rows) { return { lastRow: rows.length + 1, get: (r, k) => (rows[r - 2] || {})[k] || '' }; }
const now = new Date('2026-11-12T08:30:00Z'), d = (s) => new Date(s);
let fails = 0;
function check(ok, msg) { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; }
// The real week: 6 first emails, 3 bounces
const real = table([
  { email: 'pat.drea@autoboland.com', sent_1_at: d('2026-11-10T11:26Z'), bounced_at: d('2026-11-10T11:30Z') },
  { email: 'careers@muzz.com', sent_1_at: d('2026-11-11T09:11Z') },
  { email: 'abhiarora@joinfleek.com', sent_1_at: d('2026-11-11T09:11Z'), bounced_at: d('2026-11-11T09:30Z') },
  { email: 'saurabh.gupta@cityfurnish.com', sent_1_at: d('2026-11-11T03:41Z') },
  { email: 'recruiting@duffel.com', sent_1_at: d('2026-11-11T12:56Z'), bounced_at: d('2026-11-11T13:30Z') },
  { email: 'andrew@circuithub.com', sent_1_at: d('2026-11-11T12:56Z') },
]);
const S = { BOUNCE_PAUSE_PCT: '2' };
let w = ctx.bounceWindow_(real, S, now);
check(w.sent === 6 && w.bounced === 3, 'real week counted: ' + w.sent + ' sent, ' + w.bounced + ' bounced');
check(ctx.bounceTrips_(w, S), 'real week would have paused sending (it never did with the old rule)');
// Old rule for comparison: only today, only after 10 sends
check(!(w.sent >= 10), 'old rule needed 10 sends in a day, which a 5-a-day cap never reaches');
// One bounce alone does not pause
w = ctx.bounceWindow_(table([{ email: 'a@x.com', sent_1_at: d('2026-11-11T09:00Z'), bounced_at: d('2026-11-11T09:05Z') }, { email: 'b@y.com', sent_1_at: d('2026-11-11T09:00Z') }]), S, now);
check(!ctx.bounceTrips_(w, S), 'a single bounce does not pause');
// After a resume, old bounces no longer count
w = ctx.bounceWindow_(real, Object.assign({ BOUNCE_COUNT_FROM: d('2026-11-12T08:45Z') }, S), new Date('2026-11-13T08:00Z'));
check(w.bounced === 0 && !ctx.bounceTrips_(w, S), 'after resume (BOUNCE_COUNT_FROM) the old bounces do not trip it again');
// Bounces older than 7 days drop out
w = ctx.bounceWindow_(real, S, new Date('2026-11-19T12:00Z'));
check(w.bounced === 0, 'bounces older than 7 days drop out of the window');
// 2 bounces in 60 sends (3.3%) pauses at the 2% default; 2 in 200 (1%) does not
const many = (n, b) => table(Array.from({ length: n }, (_, i) => ({ email: i + '@x.com', sent_1_at: d('2026-11-11T09:00Z'), bounced_at: i < b ? d('2026-11-11T10:00Z') : '' })));
check(ctx.bounceTrips_(ctx.bounceWindow_(many(60, 2), S, now), S), '2 bounces in 60 sends (3.3%) pauses');
check(!ctx.bounceTrips_(ctx.bounceWindow_(many(200, 2), S, now), S), '2 bounces in 200 sends (1%) does not');
console.log(fails ? fails + ' failed' : 'all bounce brake checks passed');
process.exit(fails ? 1 : 0);
