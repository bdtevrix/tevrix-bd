/*
 * Preview-only stand-ins for the automation's public functions (Code.gs),
 * so the Run buttons do something believable against the sample data.
 * The real Code.gs replaces all of this.
 */
function dispatchIntake() {
  var t = uiTable_('Leads');
  var add = [['Copperleaf Vets', 'UK', 'Vet nurse x6 across 4 practices', 6], ['Brightwater Pools', 'Australia', 'Pool technicians x8 before summer', 8], ['Helix Diagnostics', 'US', 'Lab assistants x11, reposted', 11]];
  var made = 0;
  add.forEach(function (a) {
    var domain = a[0].toLowerCase().replace(/[^a-z]+/g, '') + '.example';
    if (t.rows.some(function (r) { return r[t.col.domain] === domain; })) return;
    uiAppend_(t, { lead_id: uiLeadId_(domain), found_at: new Date(), source: 'jobspy', segment: 'SMB hiring', company: a[0], domain: domain, website: 'https://' + domain, country: a[1], open_roles: a[3], signal: a[2], status: 'new' });
    made++;
  });
  return { message: made ? 'Lead search ran. ' + made + ' new leads are in the Leads tab.' : 'Lead search ran. Nothing new this time.' };
}

function sendTick() {
  var s = uiSettings_();
  if (s.SENDING_PAUSED === true || String(s.SENDING_PAUSED).toUpperCase() === 'TRUE') return { message: 'Sending is paused, so nothing went out.' };
  var test = s.TEST_MODE === true || String(s.TEST_MODE).toUpperCase() === 'TRUE';
  var t = uiTable_('Outreach'), max = Number(s.MAX_SENDS_PER_RUN) || 3, sent = 0, answers = 0;
  t.rows.forEach(function (r, i) {
    if (sent < max && r[t.col.stage] === 'approved') {
      uiSet_(t, i, 'stage', 'sent_1'); uiSet_(t, i, 'sent_1_at', new Date()); uiSet_(t, i, 'thread_id', 'preview-' + i);
      uiLog_(r[t.col.mailbox] || 'system', 'sent_1', r[t.col.lead_id], r[t.col.company] + (test ? ' (test inbox)' : ''));
      sent++;
    }
    if (r[t.col.reply_decision] === 'send' && !r[t.col.reply_sent_at]) {
      uiSet_(t, i, 'reply_sent_at', new Date());
      uiLog_(r[t.col.mailbox] || 'system', 'reply_sent', r[t.col.lead_id], r[t.col.company]);
      answers++;
    }
  });
  var parts = [];
  if (sent) parts.push(sent + ' first email' + (sent > 1 ? 's' : ''));
  if (answers) parts.push(answers + ' answer' + (answers > 1 ? 's' : ''));
  return { message: parts.length ? 'Sent ' + parts.join(' and ') + (test ? ' to the test inbox.' : '.') : 'Nothing was due.' };
}

function checkTick() {
  var t = uiTable_('Outreach');
  for (var i = 0; i < t.rows.length; i++) {
    var r = t.rows[i];
    if ((r[t.col.stage] === 'sent_1' || r[t.col.stage] === 'sent_2') && !r[t.col.replied_at]) {
      uiSet_(t, i, 'stage', 'replied'); uiSet_(t, i, 'replied_at', new Date()); uiSet_(t, i, 'reply_label', 'interested');
      uiSet_(t, i, 'reply_text', 'Thanks for reaching out. We are hiring for a few roles right now. How long does setup take?');
      uiSet_(t, i, 'reply_draft', 'Setup takes about a day: we load your open roles and you get a link to share with applicants.\n\nWould a 20-minute walkthrough this week help?');
      uiLog_(r[t.col.mailbox] || 'system', 'reply_in', r[t.col.lead_id], r[t.col.company] + ' · interested');
      return { message: 'Checked replies. 1 new reply from ' + r[t.col.company] + '.' };
    }
  }
  return { message: 'Checked replies. Nothing new.' };
}

function sendTestEmail() {
  var s = uiSettings_();
  return { message: 'Test email sent to ' + (s.TEST_RECIPIENT || 'the test inbox') + '.' };
}

// Code.gs has these as the menu versions of the timers; the console's Run buttons call them.
function sendNow() { return sendTick(); }
function checkNow() { return checkTick(); }
