// Browser checks on the built preview. node tests/ui_test.js  (after python3 build_preview.py)
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const file = 'file://' + path.join(__dirname, '..', 'dist', 'preview-test.html');
const shots = path.join(__dirname, '..', 'dist', 'shots');
fs.mkdirSync(shots, { recursive: true });
let failed = 0;
function check(ok, label) { console.log((ok ? '  ok   ' : '  FAIL ') + label); if (!ok) failed++; }
const wait = (p, ms) => p.waitForTimeout(ms);

async function noOverflow(page, label) {
  const vw = page.viewportSize().width;
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  check(o.sw <= vw + 1 && o.w <= vw + 1, `${label}: no sideways scroll (${o.sw}, ${o.w} <= ${vw})`);
}

(async () => {
  const browser = await chromium.launch();

  // ---------------- desktop, light
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(file);
  await page.waitForSelector('.need .v');
  check(/Good (morning|afternoon|evening)/.test(await page.textContent('h1')), 'Today greets');
  check((await page.textContent('#previewBar')).includes('SAMPLE DATA'), 'preview banner shows');
  check(await page.isVisible('text=Run on AI gates'), 'gates card on Today');
  check((await page.$$('.fun-row')).length === 8, 'funnel has 8 steps');
  await page.screenshot({ path: path.join(shots, 'today-light.png'), fullPage: true });
  await noOverflow(page, 'Today desktop');

  // Review: keyboard flow
  await page.keyboard.press('2');
  await page.waitForSelector('.q-item.on');
  const firstCo = await page.textContent('.detail h2');
  check(firstCo === 'Northwind Freight', 'Review opens on the best-fit draft');
  check((await page.$$('[data-checks] .chip')).length === 6, 'six email checks shown');
  await page.screenshot({ path: path.join(shots, 'review-light.png') });
  await page.fill('#f-subject', 'Warehouse hiring at Northwind');
  check((await page.textContent('[data-dirty]')).includes('Unsaved'), 'edit marks unsaved');
  await page.click('body', { position: { x: 5, y: 880 } });
  await page.keyboard.press('a');
  await page.waitForSelector('.toast.show');
  check((await page.textContent('.toast')).includes('Approved Northwind Freight'), 'A approves with a toast');
  await wait(page, 600);
  const nextCo = await page.textContent('.detail h2');
  check(nextCo !== 'Northwind Freight', 'moves to the next draft (' + nextCo + ')');
  await page.click('.toast button');
  await wait(page, 900);
  check((await page.textContent('.detail h2')) === 'Northwind Freight', 'Undo brings it back');
  check((await page.inputValue('#f-subject')) === 'Warehouse hiring at Northwind', 'the edit was saved with the approval');

  // approve shows up in Approved (Review tab) and in Pipeline, and View jumps there
  await page.keyboard.press('a');
  await page.waitForSelector('.toast.show >> text=Pipeline under Approved');
  await page.click('.toast button:has-text("View")');
  await page.waitForSelector('.pcard.flash');
  const flashCo = await page.textContent('.pcard.flash b');
  check(flashCo === 'Northwind Freight', 'View jumps to the card in Pipeline → Approved');
  const firstCol = await page.textContent('.col .col-head');
  check(/Approved/.test(firstCol), 'first Pipeline column is Approved');
  await page.click('.nav-item[data-to="review"]');
  await page.click('[data-act="review-tab"][data-v="approved"]');
  await page.waitForSelector('.q-item.on');
  check((await page.textContent('.detail h2')) === 'Northwind Freight', 'Approved tab lists it');
  check(await page.isVisible('.notice.good >> text=goes out on the next send run'), 'approved detail explains what happens next');
  await page.click('.actionbar [data-act="undo"]');
  await page.waitForSelector('.toast.show >> text=back in review');
  await wait(page, 500);
  check(await page.isVisible('.qtabs button.on >> text=To review'), 'Back to review returns to the To review tab');
  // S asks why before skipping; the reason shows in the toast
  const skipCo = await page.textContent('.detail h2');
  await page.click('body', { position: { x: 5, y: 880 } });
  await page.keyboard.press('s');
  await page.waitForSelector('[data-act="skip-reason"]');
  check((await page.$$('[data-act="skip-reason"][data-r]:not([data-r=""])')).length === 6, 'skip asks for one of six reasons');
  await page.keyboard.press('3');
  await page.waitForSelector('.toast.show >> text=Skipped');
  const skipToast = await page.textContent('.toast');
  check(skipToast.includes('Skipped ' + skipCo) && /weak hook/i.test(skipToast), 'key 3 skips with the reason (' + skipToast.trim().slice(0, 60) + ')');
  await page.screenshot({ path: path.join(shots, 'skip-reason.png') });
  await wait(page, 500);
  await page.click('[data-act="review-tab"][data-v="skipped"]');
  await page.waitForSelector('.q-item.on');
  const skippedOk = await page.waitForSelector('.detail .notice:has-text("Skipped")', { timeout: 5000 }).then(() => true, () => false);
  check(skippedOk, 'skipped drafts open with their full text');
  await page.click('[data-act="review-tab"][data-v="todo"]');

  // sidebar collapses and opens
  await page.click('#sideToggle');
  await wait(page, 450);
  const railW = await page.evaluate(() => document.querySelector('.side').getBoundingClientRect().width);
  check(railW < 80, 'sidebar collapses to a rail (' + Math.round(railW) + 'px)');
  check(!(await page.isVisible('.nav-label')), 'labels hide in the rail');
  await page.screenshot({ path: path.join(shots, 'review-collapsed.png') });
  await page.click('.nav-item[data-to="pipeline"]');
  check(await page.isVisible('h1 >> text=Every lead'), 'rail icons still navigate');
  await page.click('body', { position: { x: 900, y: 80 } });
  await page.keyboard.press('[');
  await wait(page, 450);
  const fullW = await page.evaluate(() => document.querySelector('.side').getBoundingClientRect().width);
  check(fullW > 200, '[ opens it again (' + Math.round(fullW) + 'px)');
  await page.click('.nav-item[data-to="review"]');
  await page.waitForSelector('.q-item.on');

  // risky email: approve disabled, LinkedIn primary
  await page.click('.q-item:has-text("Brightpath Learning")');
  check(await page.isDisabled('[data-act="approve"]'), 'risky address cannot be approved');
  await page.click('[data-act="review-view"][data-v="sent"]');
  check(await page.isVisible('.mail-head >> text=Test mode'), 'As sent view shows test mode');
  await page.click('[data-act="to-li"]');
  await page.waitForSelector('.toast.show >> text=LinkedIn');
  check(true, 'moved to LinkedIn');

  // Replies
  await page.keyboard.press('3');
  await page.waitForSelector('blockquote.their');
  await page.screenshot({ path: path.join(shots, 'replies-light.png') });
  await wait(page, 1600); // let the background refresh from the last action land
  const sendBtn = await page.$('[data-act="reply-send"]');
  if (sendBtn) {
    await page.click('[data-act="reply-send"]');
    await page.waitForSelector('.toast.show >> text=Queued');
    check(true, 'answer queued');
  } else check(false, 'send button present');

  // Pipeline drawer
  await page.keyboard.press('4');
  await page.waitForSelector('.pcard');
  check((await page.$$('.lane')).length === 2, 'Pipeline has a Sequence lane and a Conversations lane');
  check((await page.$$('[data-act="pipe-more"]')).length === 0, 'no Show more buttons');
  const colScroll = await page.$eval('.col-list[data-keep="pc-sent_1"]', (el) => ({ sh: el.scrollHeight, ch: el.clientHeight, n: el.querySelectorAll('.pcard').length }));
  check(colScroll.sh > colScroll.ch && colScroll.n === 9, 'a long column scrolls on its own (' + colScroll.n + ' cards in ' + colScroll.ch + 'px)');
  await page.$eval('.col-list[data-keep="pc-sent_1"]', (el) => { el.scrollTop = 200; });
  await noOverflow(page, 'Pipeline board desktop');
  await page.screenshot({ path: path.join(shots, 'pipeline-board.png') });
  // drag a reply into Demo booked
  const dragCo = await page.textContent('.col[data-drop="replied"] .pcard b');
  await page.dragAndDrop('.col[data-drop="replied"] .pcard', '.col[data-drop="demo"]');
  await page.waitForSelector('.toast.show >> text=Demo booked');
  await wait(page, 500);
  check((await page.textContent('.col[data-drop="demo"]')).includes(dragCo), 'dragging a card into Demo booked moves it (' + dragCo + ')');
  // needs-you filter and list view
  await page.click('.pipe-bar [data-act="pipe-needs"]');
  await wait(page, 200);
  const flagged = await page.$$eval('.pcard', (els) => els.length);
  check(flagged > 0 && flagged < 20, 'Needs you narrows the board (' + flagged + ' cards)');
  await page.click('[data-act="pipe-clear"]');
  await page.click('[data-act="pipe-view"][data-v="list"]');
  await page.waitForSelector('.ptable');
  check((await page.$$('.ptable tbody tr')).length > 50, 'List view shows every lead');
  await page.click('.th-sort[data-k="company"]');
  const firstRow = await page.textContent('.ptable tbody tr:first-child b');
  check(/^A/.test(firstRow), 'List sorts by company (' + firstRow + ')');
  await page.screenshot({ path: path.join(shots, 'pipeline-list.png') });
  await page.click('[data-act="pipe-view"][data-v="board"]');
  await page.$eval('.col-list[data-keep="pc-sent_1"]', (el) => { el.scrollTop = 180; });
  await page.click('[data-act="pipe-view"][data-v="board"]');
  const kept = await page.$eval('.col-list[data-keep="pc-sent_1"]', (el) => el.scrollTop);
  check(kept > 100, 'a column keeps its scroll position when the board redraws (' + kept + ')');
  await page.click('.pcard');
  await page.waitForSelector('.drawer.open .timeline');
  await wait(page, 700);
  check(await page.isVisible('.drawer.open >> text=Email 1'), 'drawer shows the email text');
  await page.screenshot({ path: path.join(shots, 'pipeline-drawer.png') });
  await page.keyboard.press('Escape');
  await wait(page, 400);
  check(!(await page.isVisible('.drawer.open')), 'Esc closes the drawer');

  // Leads: add one
  await page.keyboard.press('5');
  await page.click('[data-act="lead-add-toggle"]');
  await page.fill('#nl-company', 'Preview Test Co');
  await page.fill('#nl-website', 'previewtest.example');
  await page.click('form[data-form="lead-add"] button[type="submit"]');
  await page.waitForSelector('.toast.show >> text=Preview Test Co added');
  await wait(page, 900);
  check(await page.isVisible('td >> text=Preview Test Co'), 'new lead appears');

  // LinkedIn: tick sent
  await page.keyboard.press('6');
  await page.waitForSelector('.li-card');
  const before = (await page.$$('.li-card')).length;
  await page.check('.li-card input[data-flag="sent"]');
  await wait(page, 900);
  check((await page.$$('.li-card')).length === before - 1, 'ticking Sent moves it out of To send');

  // Waitlist
  await page.keyboard.press('7');
  await page.waitForSelector('text=Founders who asked');
  await page.screenshot({ path: path.join(shots, 'waitlist-light.png') });

  // Playbook: approve a proposed rule, add one
  await page.keyboard.press('8');
  await page.waitForSelector('text=The rules Claude follows');
  await page.screenshot({ path: path.join(shots, 'playbook-light.png') });
  const proposedBefore = (await page.$$('[data-act="pb-decide"][data-status="approved"]')).length;
  await page.click('[data-act="pb-decide"][data-status="approved"]');
  await wait(page, 700);
  check((await page.$$('[data-act="pb-decide"][data-status="approved"]')).length === proposedBefore - 1, 'approving a proposed rule moves it to In use');
  await page.click('[data-act="pb-add-toggle"]');
  await page.fill('#pb-rule', 'Never mention funding in the subject line');
  await page.click('form[data-form="pb-add"] button[type="submit"]');
  await page.waitForSelector('text=Never mention funding in the subject line');
  check(true, 'a founder can add a rule');

  // Controls: go-live gate and run
  await page.keyboard.press('9');
  await page.waitForSelector('.golive');
  check(await page.isDisabled('[data-act="go-live"]'), 'go live locked until checks are done');
  for (const k of ['dns', 'warm', 'test', 'unsub']) await page.check(`input[data-k="${k}"]`);
  await page.fill('#golive', 'go live');
  check(!(await page.isDisabled('[data-act="go-live"]')), 'go live unlocks');
  await page.click('[data-act="run"][data-a="send"]');
  await page.waitForSelector('.toast.show >> text=Sent');
  check(true, 'Run now works');
  await page.fill('#s-DAILY_CAP_PER_MAILBOX', '15');
  await page.press('#s-DAILY_CAP_PER_MAILBOX', 'Tab');
  await page.waitForSelector('[data-saved="DAILY_CAP_PER_MAILBOX"]:has-text("Saved")');
  check(true, 'setting saves');
  await page.screenshot({ path: path.join(shots, 'controls-light.png'), fullPage: true });
  await noOverflow(page, 'Controls desktop');

  // dark theme
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.click('.nav-item[data-to="home"]');
  await wait(page, 300);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg === 'rgb(11, 11, 18)', 'dark theme paints the ink background');
  await page.screenshot({ path: path.join(shots, 'today-dark.png'), fullPage: true });
  await page.click('.nav-item[data-to="review"]');
  await page.waitForSelector('.detail h2');
  await page.screenshot({ path: path.join(shots, 'review-dark.png') });
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();

  // ---------------- phone, dark by system setting
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, isMobile: true });
  const p = await phone.newPage();
  const perr = [];
  p.on('pageerror', (e) => perr.push(e.message));
  await p.goto(file);
  await p.waitForSelector('.need .v');
  await noOverflow(p, 'Today phone');
  await p.screenshot({ path: path.join(shots, 'phone-today.png'), fullPage: true });
  for (const r of ['review', 'replies', 'pipeline', 'leads', 'linkedin', 'waitlist', 'playbook', 'controls']) {
    await p.click(`.nav-item[data-to="${r}"]`);
    await wait(p, 250);
    await noOverflow(p, r + ' phone');
  }
  // phone pipeline: one stage at a time
  await p.click('.nav-item[data-to="pipeline"]');
  await p.waitForSelector('.stage-strip');
  check((await p.$$('.lane')).length === 0, 'phone pipeline has no squeezed columns');
  check((await p.textContent('.stage-chip.on')).includes('Replied'), 'phone opens on Replied when a reply is waiting');
  await p.screenshot({ path: path.join(shots, 'phone-pipeline.png') });
  await p.tap('.stage-chip[data-v="sent_1"]');
  await wait(p, 200);
  check((await p.$$('.mstage .pcard')).length === 9, 'tapping a stage shows its cards');
  check(!(await p.$('.pcard[draggable]')), 'cards are not draggable on a phone');
  await p.tap('.stage-chip[data-v="demo"]');
  await p.tap('.mstage .pcard');
  await p.waitForSelector('.drawer.open');
  await wait(p, 500);
  const dw = await p.evaluate(() => document.querySelector('.drawer').getBoundingClientRect().width);
  check(dw >= 389, 'details open full screen on a phone');
  await p.screenshot({ path: path.join(shots, 'phone-drawer.png') });
  await p.tap('.drawer [data-act="set-stage"][data-stage="beta"]');
  await p.waitForSelector('.toast.show >> text=Beta client');
  check(true, 'stage changes from the phone drawer');
  await p.tap('.drawer-top [data-act="close-drawer"]');
  await wait(p, 400);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.tap('[data-act="pipe-filters"]');
  check(await p.isVisible('select[data-change="pipe-angle"]'), 'Filters opens the angle and country pickers');
  await noOverflow(p, 'pipeline phone with filters');
  const fs = await p.$eval('input[data-input="pipe-q"]', (el) => parseFloat(getComputedStyle(el).fontSize));
  check(fs >= 16, 'phone inputs are 16px so iPhones do not zoom in (' + fs + 'px)');

  await p.click('.nav-item[data-to="review"]');
  await p.waitForSelector('.q-item');
  check(!(await p.isVisible('.detail')), 'phone shows the list first');
  await p.click('.q-item');
  await p.waitForSelector('.detail h2');
  check(!(await p.isVisible('.queue')), 'tapping opens the draft full width');
  await noOverflow(p, 'review detail phone');
  await p.screenshot({ path: path.join(shots, 'phone-review.png') });
  await p.click('[data-act="review-back"]');
  check(await p.isVisible('.queue'), 'back returns to the list');
  check(perr.length === 0, 'no phone page errors' + (perr.length ? ': ' + perr.join(' | ') : ''));
  await phone.close();

  // ---------------- an empty Sheet, the way the real one starts
  const ectx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ep = await ectx.newPage();
  const eerr = [];
  ep.on('pageerror', (e) => eerr.push(e.message));
  await ep.goto('file://' + path.join(__dirname, '..', 'dist', 'preview-empty-test.html'));
  await ep.waitForSelector('.need .v');
  for (const r of ['review', 'replies', 'pipeline', 'leads', 'linkedin', 'waitlist', 'playbook', 'controls', 'home']) {
    await ep.click(`.nav-item[data-to="${r}"]`);
    await wait(ep, 250);
  }
  check(await ep.isVisible('text=Nothing needs you right now'), 'empty Sheet: Today says nothing needs you');
  await ep.click('.nav-item[data-to="review"]');
  check(await ep.isVisible('text=Nothing to review'), 'empty Sheet: Review shows the empty state');
  await ep.screenshot({ path: path.join(shots, 'empty-review.png') });
  check(eerr.length === 0, 'empty Sheet: no page errors' + (eerr.length ? ': ' + eerr.join(' | ') : ''));
  await ectx.close();

  await browser.close();
  console.log(failed ? `\n${failed} failed` : '\nall UI checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
