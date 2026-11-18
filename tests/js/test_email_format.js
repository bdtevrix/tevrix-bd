// Product link, bold text and links in emails (Code.gs). Run: node tests/js/test_email_format.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8'), ctx);
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };
const S = { PRODUCT_NAME: 'HireMinds', PRODUCT_URL: 'https://hireminds.tevrixai.com', SENDER_NAME: 'Panshul Sharma',
  SENDER_TITLE: 'Founder, Tevrix AI', COMPANY_LINE: 'Tevrix AI', SIG_WEBSITE: 'www.tevrixai.com' };
ctx.perAccount_ = (v) => String(v || '');

const draft = 'Hi Emmet,\n\nI saw Evergreen Care is hiring health care assistants.\n\n' +
  '**HireMinds (hireminds.tevrixai.com) interviews every applicant for your HCA roles and gives your team a scored shortlist.**\n\nWorth a look?';
check(ctx.withProduct_(draft, S, 'volume') === draft, 'a draft that already links HireMinds is left as it is');
const old = 'Hi Pat,\n\nShort note on your recruiter role.';
const added = ctx.withProduct_(old, S, 'recruiter_hire');
check(/\*\*See how HireMinds works: hireminds\.tevrixai\.com\*\*$/.test(added), 'older drafts get a bold "See how HireMinds works" line');
check(ctx.withProduct_(old, S, 'partner') === old, 'partner emails (Tevrix services) get no HireMinds line');
check(ctx.withProduct_(old, {}, 'volume') === old, 'no PRODUCT_URL: nothing is added');

const html = ctx.htmlEmail_(draft, Object.assign({ LOGO_URL: 'https://x/logo.png' }, S), false, 'volume');
check(/<strong>HireMinds \(<a href="https:\/\/hireminds\.tevrixai\.com"[^>]*>hireminds\.tevrixai\.com<\/a>\) interviews every applicant/.test(html),
  'HTML: the HireMinds sentence is bold and the address is a link');
check(!/\*\*/.test(html), 'HTML: no asterisks left');
check(/>HireMinds<\/a>/.test(html), 'HTML signature links HireMinds');
const text = ctx.withSignature_(draft, S, false, 'volume');
check(!/\*\*/.test(text) && /HireMinds \(hireminds\.tevrixai\.com\) interviews/.test(text), 'plain text: same words, no asterisks');
check(/HireMinds: https:\/\/hireminds\.tevrixai\.com/.test(text), 'plain-text signature has the HireMinds link');
const partnerSig = ctx.withSignature_('Hi there', S, false, 'partner');
check(!/hireminds/i.test(partnerSig), 'partner signature has no HireMinds link');
const mail = ctx.inlineHtml_('Write to careers@muzz.com or see tevrixai.com.');
check(/careers@muzz\.com/.test(mail) && !/@<a/.test(mail) && /<a href="https:\/\/tevrixai\.com"[^>]*>tevrixai\.com<\/a>\./.test(mail),
  'email addresses stay plain; a web address before a full stop is linked without the stop');
check(ctx.inlineHtml_('<b>hi</b> 3.5 e.g. ok') === '&lt;b&gt;hi&lt;/b&gt; 3.5 e.g. ok', 'HTML in a draft is escaped; numbers and e.g. are not links');
console.log(fails ? fails + ' failed' : 'all email format checks passed');
process.exit(fails ? 1 : 0);
