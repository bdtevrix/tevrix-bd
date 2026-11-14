/*
 * Sample data for the preview and the tests. Every company, person and address
 * here is made up; email domains end in .example so nothing can ever be sent.
 */
(function (root) {
  'use strict';
  var G = root.__fakeGAS;
  var NOW = Date.now();
  function ago(d, h) { return new Date(NOW - ((d || 0) * 24 + (h || 0)) * 3600 * 1000); }
  function hex8(s) {
    return G.sha1Bytes(s).slice(0, 4).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  }
  function id(domain) { return 'L-' + hex8(domain); }

  var H = {
    Outreach: ['decision', 'stage', 'company', 'country', 'contact_name', 'contact_title', 'email', 'email_status', 'signal', 'score', 'angle', 'subject', 'email_1', 'follow_up_1', 'follow_up_2', 'linkedin_note', 'dossier', 'fit_reason', 'reviewer_notes', 'lead_id', 'mailbox', 'decided_at', 'thread_id', 'message_id', 'sent_1_at', 'sent_2_at', 'sent_3_at', 'replied_at', 'reply_label', 'reply_text', 'reply_draft', 'reply_decision', 'reply_sent_at', 'bounced_at', 'cio_synced_at', 'skip_reason', 'original_email', 'email_source', 'email_proof', 'verify_result', 'bounce_type'],
    Leads: ['lead_id', 'found_at', 'source', 'segment', 'company', 'domain', 'website', 'country', 'company_size', 'open_roles', 'roles_sample', 'signal', 'job_urls', 'ceo_name', 'contact_name', 'contact_title', 'email', 'email_source', 'email_status', 'pattern', 'people_found', 'status', 'notes'],
    LinkedIn: ['date', 'founder', 'name', 'title', 'company', 'search_link', 'note', 'sent', 'accepted', 'lead_id'],
    'Do not contact': ['value', 'reason', 'added_at', 'source'],
    Log: ['time', 'mailbox', 'action', 'lead_id', 'detail'],
    Waitlist: ['date', 'name', 'company', 'role', 'country', 'channel', 'what_they_asked', 'stage', 'notes'],
    Playbook: ['id', 'added_at', 'type', 'rule', 'evidence', 'source', 'status', 'decided_at', 'decided_by'],
    Settings: ['key', 'value', 'notes']
  };
  function row(tab, o) {
    // Every sample Outreach address is "published" on the made-up company's contact page, as the research now requires.
    if (tab === 'Outreach' && o.email && !o.hasOwnProperty('email_source')) {
      o.email_source = 'published'; o.email_proof = 'https://' + o.email.split('@')[1] + '/contact';
    }
    return H[tab].map(function (h) { return o.hasOwnProperty(h) ? o[h] : ''; });
  }

  var MB = 'team@tryhireminds.example';
  var out = [], leads = [], log = [];

  // ---- drafts waiting for review, written the way Claude writes them
  var drafts = [
    { company: 'Northwind Freight', domain: 'northwindfreight.example', country: 'UK', contact_name: 'Priya Raman', contact_title: 'Head of Talent', status: 'safe', score: 86, angle: 'Hiring spike', size: '200–500', roles: 14, sample: 'Warehouse operative, Shift lead, Transport planner',
      signal: '14 roles posted in 3 weeks, 9 of them warehouse ops in Leeds and Bradford.',
      fit: 'Volume hiring with a one-person talent team. First-round screening is the bottleneck.',
      subject: '14 warehouse roles at Northwind',
      e1: 'Hi Priya,\n\nSaw Northwind has 14 roles open, nine of them in warehouse ops across Leeds and Bradford. That is a lot of first-round screening for one talent team.\n\nHireMinds takes that first pass. It screens every applicant against the role and runs a short first interview, so your team only meets the shortlist.\n\nWould a two-minute walkthrough on one of your live warehouse roles be useful?',
      f1: 'Priya, one more thought on the warehouse roles. Most teams we speak to lose about a week per hire just booking first calls. Happy to show how HireMinds handles that on one of your roles. Worth a look?',
      f2: 'Last note from me. If hiring at the Leeds site settles down, I will leave you be. If not, reply "show me" and I will send the walkthrough.',
      li: 'Hi Priya, saw Northwind is hiring 14 roles in warehouse ops. I run HireMinds, which takes first-round screening off talent teams. Glad to connect.',
      dossier: 'Northwind Freight: UK third-party logistics, about 400 staff, sites in Leeds and Bradford.\nPosted 14 roles since 20 Oct (Indeed 9, Reed 5): warehouse operatives, two shift leads, two transport planners.\nPriya Raman has led talent since 2023 (team page). No other recruiter listed.\nCareers page is a basic form with no screening step visible.' },
    { company: 'Lumen Dental Group', domain: 'lumendental.example', country: 'Australia', contact_name: 'Tom Becker', contact_title: 'COO', status: 'safe', score: 81, angle: 'Recruiter bandwidth', size: '50–200', roles: 9, sample: 'Dental nurse, Practice manager, Receptionist',
      signal: '9 open roles across 6 clinics; the COO is listed as hiring contact on every ad.',
      fit: 'Operations lead doing hiring on the side. Saving his hours is the pitch.',
      subject: 'Hiring for six clinics',
      e1: 'Hi Tom,\n\nNoticed your name is on all nine Lumen job ads, from dental nurses to a practice manager. Hiring for six clinics on top of running them is a lot.\n\nHireMinds reads every application and runs the first interview for you, then hands over a ranked shortlist with notes.\n\nCould I show you what that looks like for the dental nurse role?',
      f1: 'Tom, a quick follow-up. Clinic groups we work with usually get the first round off their plate in the first week. Want me to set one role up as a test?',
      f2: 'Closing the loop here. If the clinics are fully staffed, ignore this. If not, a one-word reply gets you a walkthrough.',
      li: 'Hi Tom, saw Lumen is hiring across six clinics. HireMinds runs first interviews so ops leads get their hours back. Happy to connect.',
      dossier: 'Lumen Dental Group: 6 clinics in Melbourne and Geelong. 9 roles live on Seek.\nTom Becker (COO) listed as contact on all ads. No HR person on LinkedIn.\nGoogle reviews mention long wait times; staffing gaps likely.' },
    { company: 'Brightpath Learning', domain: 'brightpathlearning.example', country: 'UAE', contact_name: 'Sara Al Mansoori', contact_title: 'HR Director', status: 'risky', score: 78, angle: 'Time to hire', size: '200–500', roles: 22, sample: 'Teacher (Maths), Teaching assistant, Admissions officer',
      signal: '22 teaching roles open for the January term, most posted 6+ weeks ago.',
      fit: 'Long-open roles before a hard term start date. Speed is what she needs.',
      subject: 'January term roles at Brightpath',
      e1: 'Hi Sara,\n\nBrightpath still has 22 teaching roles open for January, and most have been live for over six weeks. With term dates fixed, every week counts.\n\nHireMinds screens applicants the day they apply and runs the first interview, so good teachers do not sit in the queue.\n\nWould it help to see it on your Maths teacher role?',
      f1: 'Sara, following up before the term rush. Happy to run one role through HireMinds so you can judge the shortlist yourself. Shall I?',
      f2: 'Last one from me. If January hiring is sorted, all good. If not, reply and I will set up the test role.',
      li: 'Hi Sara, saw Brightpath is hiring 22 teachers for January. HireMinds runs first-round interviews so roles fill faster. Would love to connect.',
      dossier: 'Brightpath Learning: 4 K-12 schools in Dubai and Sharjah. 22 roles on Bayt and the careers page.\nSara Al Mansoori, HR Director since 2021. Email pattern guessed (first.last), server accepts all, so marked risky.' },
    { company: 'Kestrel Robotics', domain: 'kestrelrobotics.example', country: 'Germany', contact_name: 'Jonas Weber', contact_title: 'Co-founder & CEO', status: 'safe', score: 74, angle: 'Founder-led hiring', size: '11–50', roles: 6, sample: 'Embedded engineer, Robotics technician, Field service engineer',
      signal: 'Raised a Series A last month; 6 engineering roles posted the same week.',
      fit: 'Founder still doing first calls after a raise. Classic founder-led hiring.',
      subject: 'After the Series A',
      e1: 'Hi Jonas,\n\nCongratulations on the Series A. I saw six engineering roles went up the same week, and on a team your size the first calls usually land on the founder.\n\nHireMinds runs those first interviews in the candidate\'s own time and sends you a ranked shortlist, so your calendar stays on the product.\n\nOpen to a short look using your embedded engineer role?',
      f1: 'Jonas, one follow-up. Founders we work with get back four to six hours a week once first calls are off their plate. Worth testing on one role?',
      f2: 'Last note. If hiring is in good hands, ignore this. Otherwise a quick reply and I will set it up.',
      li: 'Hi Jonas, congrats on the Series A. I run HireMinds, which takes first-round interviews off founders. Glad to connect.',
      dossier: 'Kestrel Robotics: Munich, 34 staff, warehouse picking robots. Series A announced 12 Oct.\n6 roles on their Personio page, all with Jonas as hiring manager.' },
    { company: 'Harbor & Pine Hotels', domain: 'harborpine.example', country: 'US', contact_name: 'Megan Ortiz', contact_title: 'VP People', status: 'safe', score: 72, angle: 'Hiring spike', size: '500–1000', roles: 31, sample: 'Front desk agent, Housekeeper, Line cook',
      signal: '31 seasonal roles for the winter season across 4 properties.',
      fit: 'Seasonal volume, high applicant counts per role.',
      subject: 'Winter hiring at Harbor & Pine',
      e1: 'Hi Megan,\n\nHarbor & Pine has 31 seasonal roles up for winter across four properties. Front desk and housekeeping roles like these often pull hundreds of applicants each.\n\nHireMinds screens every one of them and runs a short first interview, so your managers only meet the people worth meeting.\n\nWould a walkthrough on your front desk role help?',
      f1: 'Megan, following up on winter hiring. Happy to run one property\'s roles through HireMinds as a test. Interested?',
      f2: 'Last note from me. If the season is staffed, enjoy the quiet. If not, reply and I will send the walkthrough.',
      li: 'Hi Megan, saw Harbor & Pine is hiring 31 roles for winter. HireMinds handles first-round screening at volume. Happy to connect.',
      dossier: 'Harbor & Pine Hotels: 4 boutique hotels in Maine and Vermont. 31 roles on Indeed and their careers site.\nMegan Ortiz, VP People. Small HR team of 3.' },
    { company: 'Cobalt Ledger', domain: 'cobaltledger.example', country: 'Singapore', contact_name: 'Wei Lin', contact_title: 'Head of Operations', status: '', email: '', score: 69, angle: 'Cost per hire', size: '50–200', roles: 7, sample: 'Accountant, Audit associate, Tax manager',
      signal: 'Uses two recruitment agencies for 7 finance roles (agency names on ads).',
      fit: 'Paying agency fees for roles HireMinds could pre-screen.',
      subject: 'Agency fees on 7 finance roles',
      e1: 'Hi Wei,\n\nI noticed Cobalt Ledger has seven finance roles out with two agencies. At typical agency rates that adds up quickly.\n\nHireMinds screens and interviews applicants who come to you directly, so fewer roles need an agency at all.\n\nWorth a quick look on one role?',
      f1: 'Wei, a follow-up on the finance roles. Happy to show what a direct-applicant shortlist looks like for your audit associate role. Interested?',
      f2: 'Last note. If the agencies are working well, no problem. If not, reply and I will set up a test.',
      li: 'Hi Wei, saw Cobalt Ledger is hiring for 7 finance roles. HireMinds pre-screens direct applicants so fewer roles need an agency. Glad to connect.',
      dossier: 'Cobalt Ledger: accounting firm, Singapore, about 120 staff.\nNo email found. Pattern unknown, website has no team emails.' }
  ];
  drafts.forEach(function (d, i) {
    var lid = id(d.domain);
    var email = d.email === '' ? '' : (d.contact_name.split(' ')[0].toLowerCase() + '@' + d.domain);
    out.push(row('Outreach', { stage: 'drafted', company: d.company, country: d.country, contact_name: d.contact_name, contact_title: d.contact_title, email: email, email_status: d.status,
      signal: d.signal, score: d.score, angle: d.angle, subject: d.subject, email_1: d.e1, follow_up_1: d.f1, follow_up_2: d.f2, linkedin_note: d.li, dossier: d.dossier, fit_reason: d.fit, lead_id: lid }));
    leads.push(row('Leads', { lead_id: lid, found_at: ago(1 + i % 3, 4 + i), source: i % 2 ? 'google_maps' : 'jobspy', segment: 'SMB hiring', company: d.company, domain: d.domain, website: 'https://' + d.domain, country: d.country,
      company_size: d.size, open_roles: d.roles, roles_sample: d.sample, signal: d.signal, contact_name: d.contact_name, contact_title: d.contact_title, email: email, email_source: email ? 'pattern' : '', email_status: d.status, status: 'queued' }));
  });

  // ---- the rest of the pipeline
  var people = ['Alex', 'Sam', 'Jordan', 'Riya', 'Ana', 'Leo', 'Nora', 'Omar', 'Ivy', 'Ben', 'Maya', 'Raj', 'Elena', 'Kofi', 'Hana', 'Luis', 'Zara', 'Theo', 'Amara', 'Felix'];
  var titles = ['Head of Talent', 'HR Manager', 'COO', 'Founder', 'People Lead', 'Talent Partner', 'Operations Director'];
  var countries = ['UK', 'US', 'UK', 'Australia', 'UAE', 'Singapore', 'US', 'India', 'Canada', 'Germany', 'UK', 'US'];
  var angles = ['Hiring spike', 'Recruiter bandwidth', 'Time to hire', 'Cost per hire', 'Founder-led hiring'];
  var a1 = ['Quarry', 'Mosaic', 'Tidewater', 'Ember', 'Granite', 'Sparrow', 'Juniper', 'Pinecrest', 'Orbit', 'Fernway', 'Atlas', 'Halcyon', 'Vantage', 'Meridian', 'Cedar', 'Nimbus', 'Lattice', 'Copper', 'Slate', 'Willow', 'Beacon', 'Aster', 'Summit', 'Harbour', 'Clearwater', 'Driftwood', 'Foxglove', 'Ironbark', 'Larkspur', 'Marlow', 'Oakridge', 'Pebble', 'Rosewood', 'Saffron', 'Thistle', 'Upland', 'Verity', 'Westbrook', 'Yarrow', 'Zephyr'];
  var a2 = ['Logistics', 'Retail', 'Labs', 'Studios', 'Care Homes', 'Health', 'Schools', 'Security', 'Couriers', 'Clinics', 'Field Services', 'Care', 'Builders', 'Foods', 'Payments', 'Dental', 'Hotels', 'Engineering', 'Fitness', 'Staffing'];

  function makeRow(n, stage, extra) {
    var name = a1[n % a1.length] + ' ' + a2[(n * 7 + Math.floor(n / a1.length) * 3) % a2.length];
    var domain = name.toLowerCase().replace(/[^a-z]+/g, '') + '.example';
    var person = people[n % people.length], country = countries[n % countries.length], angle = angles[(n * 3) % angles.length];
    var lid = id(domain);
    var sent1 = extra && extra.sent1 !== undefined ? extra.sent1 : 3 + (n * 5) % 26;
    var o = {
      decision: stage === 'skipped' ? 'skip' : 'approve', stage: stage, company: name, country: country, contact_name: person + ' ' + ['Hart', 'Iyer', 'Kemp', 'Novak', 'Reyes', 'Shah', 'Wolfe'][n % 7], contact_title: titles[n % titles.length],
      email: person.toLowerCase() + '@' + domain, email_status: 'safe', signal: (6 + n % 20) + ' open roles posted this month.', score: 60 + (n * 13) % 30, angle: angle,
      subject: 'Hiring at ' + name.split(' ')[0], email_1: 'Hi ' + person + ',\n\nSaw ' + name + ' is hiring. HireMinds runs the first round so your team only meets the shortlist.\n\nWorth a look?',
      lead_id: lid, mailbox: MB, decided_at: ago(sent1 + 1, 2), thread_id: 'thread-' + n, message_id: 'msg-' + n
    };
    if (stage !== 'approved' && stage !== 'skipped') o.sent_1_at = ago(sent1, n % 6);
    if (['sent_2', 'sent_3', 'finished'].indexOf(stage) !== -1 && sent1 >= 4) o.sent_2_at = ago(sent1 - 4, n % 6);
    if (['sent_3', 'finished'].indexOf(stage) !== -1 && sent1 >= 10) o.sent_3_at = ago(sent1 - 10, n % 6);
    if (stage === 'approved') { delete o.decided_at; o.decided_at = ago(0, 3 + n % 4); }
    Object.keys(extra || {}).forEach(function (k) { if (k !== 'sent1') o[k] = extra[k]; });
    out.push(row('Outreach', o));
    leads.push(row('Leads', { lead_id: lid, found_at: ago(sent1 + 2, n % 9), source: n % 3 ? 'jobspy' : 'google_maps', segment: 'SMB hiring', company: name, domain: domain, website: 'https://' + domain, country: country,
      company_size: ['11–50', '50–200', '200–500'][n % 3], open_roles: 6 + n % 20, signal: o.signal, contact_name: o.contact_name, contact_title: o.contact_title, email: o.email, email_source: 'pattern', email_status: 'safe', status: 'queued' }));
    if (o.sent_1_at) log.push(row('Log', { time: o.sent_1_at, mailbox: MB, action: 'sent_1', lead_id: lid, detail: name }));
    return o;
  }

  var n = 0;
  makeRow(n++, 'approved'); makeRow(n++, 'approved');
  var i;
  for (i = 0; i < 9; i++) makeRow(n++, 'sent_1', { sent1: i % 4 });
  for (i = 0; i < 7; i++) makeRow(n++, 'sent_2', { sent1: 4 + i % 5 });
  for (i = 0; i < 6; i++) makeRow(n++, 'sent_3', { sent1: 10 + i % 4 });
  for (i = 0; i < 38; i++) makeRow(n++, 'finished', { sent1: 15 + i % 14 });

  var r1 = makeRow(n++, 'replied', { sent1: 5, replied_at: ago(0, 2), reply_label: 'interested',
    reply_text: 'Hi, timing is good actually. We have 12 care assistant roles open and my two coordinators are drowning in applications. What does this cost for a group our size, and can candidates answer in Hinglish?',
    reply_draft: 'Thanks for the quick reply. The first month is free on one of your roles, and I will walk you through pricing for a group your size on the call.\n\nOn Hinglish: yes, candidates can answer in English or Hinglish, and your coordinators get the scores and transcripts.\n\nWould Thursday or Friday suit for a 20-minute walkthrough on one of the care assistant roles?' });
  var r2 = makeRow(n++, 'replied', { sent1: 9, sent2: true, replied_at: ago(0, 7), reply_label: 'wrong_person',
    reply_text: 'Not me, I left the hiring side in September. Try Ana Duarte, she runs talent now.',
    reply_draft: 'Thanks for pointing me the right way, much appreciated. I will reach out to Ana directly.' });
  var r3 = makeRow(n++, 'replied', { sent1: 12, replied_at: ago(1, 3), reply_label: 'interested', reply_decision: 'send',
    reply_text: 'Interesting. We are opening two new sites in spring and will need about 40 people. Can you send a short video of how it works?',
    reply_draft: 'Two sites and 40 people is exactly where this helps. Here is the short version: applicants get a first interview link the day they apply, and you get a ranked shortlist with notes.\n\nA video does not do it justice, so how about 20 minutes next week on your own roles?' });
  var dm1 = makeRow(n++, 'demo', { sent1: 18, replied_at: ago(14, 2), reply_label: 'interested', reply_text: 'Yes, let us talk next week.', reply_draft: 'Great, here is a link to pick a time.', reply_sent_at: ago(14, 1) });
  var dm2 = makeRow(n++, 'demo', { sent1: 11, replied_at: ago(6, 5), reply_label: 'interested', reply_text: 'Could do Tuesday.', reply_draft: 'Tuesday works. Invite sent.', reply_sent_at: ago(6, 4) });
  var bt = makeRow(n++, 'beta', { sent1: 26, replied_at: ago(22, 2), reply_label: 'interested', reply_text: 'Happy to try the free month.', reply_draft: 'Brilliant. Setting you up today.', reply_sent_at: ago(22, 1), cio_synced_at: ago(19, 0) });
  makeRow(n++, 'lost', { sent1: 20, replied_at: ago(17, 0), reply_label: 'not_now', reply_text: 'We just signed with another tool, sorry.' });
  makeRow(n++, 'bounced', { sent1: 8, bounced_at: ago(8, 0) });
  // skips with the reason the founder picked, so the Playbook has something to learn from
  ['size', 'size', 'size', 'size', 'size', 'wrong_person', 'wrong_person', 'weak_hook', 'weak_hook', 'weak_hook', 'wrong_country', 'not_a_fit', ''].forEach(function (r) {
    makeRow(n++, 'skipped', { skip_reason: r });
  });
  // drafts a founder rewrote before approving: Claude's version is kept in original_email
  [0, 1, 2].forEach(function (k) {
    var o = out[10 + k], col = H.Outreach.indexOf('original_email'), e1 = H.Outreach.indexOf('email_1');
    o[col] = JSON.stringify({ subject: o[H.Outreach.indexOf('subject')], email_1: o[e1] + '\n\nI hope this is useful and look forward to hearing from you at a time that suits you.', follow_up_1: '', follow_up_2: '' });
  });
  [dm1, dm2].forEach(function (o, k) { log.push(row('Log', { time: k ? ago(6, 3) : ago(13, 0), mailbox: 'founder@tevrix.example', action: 'stage', lead_id: o.lead_id, detail: 'demo' })); });
  log.push(row('Log', { time: ago(19, 0), mailbox: 'founder@tevrix.example', action: 'stage', lead_id: bt.lead_id, detail: 'beta' }));
  [r1, r2, r3].forEach(function (o) { log.push(row('Log', { time: o.replied_at, mailbox: MB, action: 'reply_in', lead_id: o.lead_id, detail: o.company + ' · ' + o.reply_label })); });
  log.push(row('Log', { time: ago(0, 1), mailbox: 'founder@tevrix.example', action: 'approve', lead_id: out[6] ? out[6][19] : '', detail: out[6] ? out[6][2] : '' }));
  log.push(row('Log', { time: ago(0, 5), mailbox: 'system', action: 'run', lead_id: '', detail: 'Find leads: 23 found, 9 new' }));

  // ---- fresh leads not yet drafted, plus parked and duplicates
  var fresh = [
    ['Bluebell Nurseries', 'UK', 'Nursery practitioner x8, 2 managers', 11], ['Granary Bakehouse', 'Ireland', '6 bakers and 4 drivers before the holidays', 10],
    ['Keel Marine Services', 'Australia', 'Marine engineers, 5 roles reposted twice', 5], ['Solstice Wellness', 'US', '12 therapist roles across 3 states', 12],
    ['Tallyho Events', 'UK', 'Seasonal event staff, 20+ roles', 22], ['Riverstone Pharmacy', 'Canada', 'Pharmacy technician x7', 7],
    ['Arcadia Fitness', 'UAE', 'Personal trainers x9 for a new club', 9], ['Northgate Facilities', 'UK', 'Cleaning supervisors and operatives, 15 roles', 15],
    ['Peregrine Software', 'India', 'Founder posting 5 engineering roles himself', 5], ['Quayside Dental', 'New Zealand', 'Dental nurse x4, receptionist x2', 6],
    ['Silverline Security', 'US', '18 guard roles, 3 sites', 18], ['Moonrise Kitchens', 'Singapore', 'Cloud kitchen, 10 cook roles', 10]
  ];
  fresh.forEach(function (f, k) {
    var domain = f[0].toLowerCase().replace(/[^a-z]+/g, '') + '.example';
    leads.push(row('Leads', { lead_id: id(domain), found_at: ago(0, 1 + k), source: k % 2 ? 'jobspy' : 'google_maps', segment: 'SMB hiring', company: f[0], domain: domain, website: 'https://' + domain,
      country: f[1], open_roles: f[3], signal: f[2], contact_name: k % 3 ? '' : 'Contact found', contact_title: k % 3 ? '' : 'Owner', email: k % 3 ? '' : 'hello@' + domain, email_source: k % 3 ? '' : 'website', email_status: k % 3 ? '' : 'safe', status: 'new' }));
  });
  [['Paragon Staffing', 'UK', 'Recruitment agency (competitor, parked)'], ['Lighthouse Charity Shops', 'UK', 'Volunteer roles only'], ['Gridline Telecom', 'US', 'Enterprise, 5,000+ staff']].forEach(function (f, k) {
    var domain = f[0].toLowerCase().replace(/[^a-z]+/g, '') + '.example';
    leads.push(row('Leads', { lead_id: id(domain), found_at: ago(3 + k, 0), source: 'jobspy', company: f[0], domain: domain, website: 'https://' + domain, country: f[1], signal: f[2], status: 'parked', notes: 'Not a fit' }));
  });
  leads.push(row('Leads', { lead_id: id('northwindfreight.example') + '-2', found_at: ago(0, 9), source: 'google_maps', company: 'Northwind Freight Ltd', domain: 'northwindfreight.example', country: 'UK', status: 'duplicate', notes: 'Same domain as an existing lead' }));
  leads.sort(function (a, b) { return a[1] - b[1]; });

  log.sort(function (a, b) { return a[0] - b[0]; });

  var settings = [
    ['SENDING_PAUSED', false, 'TRUE stops all sending'], ['TEST_MODE', true, 'TRUE sends every email to TEST_RECIPIENT'], ['TEST_RECIPIENT', 'test-inbox@tevrix.example', ''],
    ['SEND_AS', MB, ''], ['MAILBOXES', MB, 'Comma separated'], ['SENDER_NAME', 'Your name', ''], ['SENDER_TITLE', 'Co-founder, HireMinds', ''],
    ['COMPANY_LINE', 'HireMinds by Tevrix AI · hireminds.tevrixai.com', ''], ['POSTAL_ADDRESS', '', 'Required in every email'], ['BOOKING_LINK', 'https://cal.example/hireminds/20min', ''],
    ['DAILY_CAP_PER_MAILBOX', 20, ''], ['MAX_SENDS_PER_RUN', 3, ''], ['SEND_DAYS', 'Mon-Fri', ''], ['SEND_START_HOUR', 9, ''], ['SEND_END_HOUR', 16, ''],
    ['FOLLOWUP_1_AFTER_DAYS', 4, ''], ['FOLLOWUP_2_AFTER_DAYS', 10, ''], ['FINISH_AFTER_DAYS', 15, ''], ['BOUNCE_PAUSE_PCT', 3, ''],
    ['ALERT_EMAILS', 'founders@tevrix.example', ''], ['GITHUB_OWNER', 'tevrix-ai', ''], ['GITHUB_REPO', 'tevrix-bd', ''], ['INTAKE_WORKFLOW', 'intake.yml', ''],
    ['AGENCIES_WORKFLOW', 'agencies.yml', ''], ['AGENCIES_DAY', 'Mon', ''], ['CIO_REGION', 'us', ''],
    ['FOUNDERS', 'Founder A, Founder B', ''], ['SIG_LINKEDIN', 'https://www.linkedin.com/in/example', ''], ['SIG_WHATSAPP', '#ERROR!', ''], ['WHATSAPP_ON_ALL_EMAILS', false, ''],
    ['SIG_WEBSITE', 'www.tevrix.example', ''], ['LOGO_URL', '', ''], ['DASHBOARD_USERS', '', 'Extra people who can open the console']
  ];

  var sheets = {
    Outreach: [H.Outreach].concat(out),
    Leads: [H.Leads].concat(leads),
    LinkedIn: [H.LinkedIn].concat([
      row('LinkedIn', { date: ago(0, 6), founder: '', name: 'Ana Duarte', title: 'Talent Lead', company: r2.company, note: 'Hi Ana, ' + r2.contact_name.split(' ')[0] + ' mentioned you run talent at ' + r2.company + ' now. I run HireMinds, which takes first-round interviews off talent teams. Glad to connect.', sent: false, accepted: false, lead_id: r2.lead_id }),
      row('LinkedIn', { date: ago(1, 2), founder: 'Founder A', name: 'Wei Lin', title: 'Head of Operations', company: 'Cobalt Ledger', note: drafts[5].li, sent: false, accepted: false, lead_id: id('cobaltledger.example') }),
      row('LinkedIn', { date: ago(2, 5), founder: '', name: 'Fatima Noor', title: 'HR Manager', company: 'Arcadia Fitness', note: 'Hi Fatima, saw Arcadia is hiring 9 trainers for the new club. HireMinds screens and runs first interviews for roles like these. Happy to connect.', sent: false, accepted: false, lead_id: '' }),
      row('LinkedIn', { date: ago(4, 0), founder: 'Founder B', name: 'Ravi Menon', title: 'Founder', company: 'Peregrine Software', note: 'Hi Ravi, saw you are hiring five engineers yourself. HireMinds takes first-round calls off founders. Glad to connect.', sent: true, accepted: false, lead_id: '' }),
      row('LinkedIn', { date: ago(7, 0), founder: 'Founder A', name: 'Claire Dubois', title: 'People Director', company: 'Solstice Wellness', note: 'Hi Claire, saw Solstice is hiring 12 therapists across three states. HireMinds runs first interviews at that volume. Happy to connect.', sent: true, accepted: true, lead_id: '' })
    ]),
    'Do not contact': [H['Do not contact']].concat([
      row('Do not contact', { value: '@paragonstaffing.example', reason: 'Competitor', added_at: ago(20, 0), source: 'founder@tevrix.example' }),
      row('Do not contact', { value: 'jane@oldclient.example', reason: 'Asked to stop', added_at: ago(11, 0), source: 'reply' })
    ]),
    Log: [H.Log].concat(log),
    Playbook: [H.Playbook].concat([
      row('Playbook', { id: 'P-261102-1', added_at: ago(8, 0), type: 'segment', rule: 'Favour placement agencies with 20 to 200 staff in India', evidence: '3 replies from 22 sends (14%) against 4% for everyone else', source: 'monday report', status: 'proposed' }),
      row('Playbook', { id: 'P-261102-2', added_at: ago(8, 0), type: 'writing', rule: 'Keep the first email under 70 words', evidence: 'Founders cut 9 of the last 12 approved drafts to under 70 words', source: 'edits', status: 'proposed' }),
      row('Playbook', { id: 'F-261020-101500', added_at: ago(20, 0), type: 'country', rule: 'No UK companies with fewer than 50 staff', evidence: 'Founder', source: 'founder', status: 'approved', decided_at: ago(20, 0), decided_by: 'founder@tevrix.example' }),
      row('Playbook', { id: 'P-261109-1', added_at: ago(1, 0), type: 'contact', rule: 'Only email a person if their address is published on the company site; otherwise use the HR or careers inbox, or LinkedIn', evidence: '4 of 5 bounces this month were email-finder addresses; 0 of 41 published addresses bounced', source: 'monday report', status: 'proposed' }),
      row('Playbook', { id: 'P-261109-2', added_at: ago(1, 0), type: 'segment', rule: 'Park companies with fewer than 30 staff', evidence: "5 of 13 skips in 28 days were 'Too big or too small', all under 30 staff", source: 'skips', status: 'proposed' }),
      row('Playbook', { id: 'P-261026-2', added_at: ago(14, 0), type: 'writing', rule: 'Never end email 1 with \'I hope this is useful\' or a closing pleasantry; end on the question', evidence: 'Founders deleted the closing line in 3 of 3 edited drafts', source: 'edits', status: 'approved', decided_at: ago(13, 0), decided_by: 'panshul@tevrix.example' }),
      row('Playbook', { id: 'P-261019-1', added_at: ago(21, 0), type: 'angle', rule: 'Use the walk_in angle for any India BPO running walk-in drives', evidence: '4 replies from 34 sends (12%) against 3% for the volume angle', source: 'monday report', status: 'approved', decided_at: ago(20, 0), decided_by: 'founder@tevrix.example' }),
      row('Playbook', { id: 'P-261012-1', added_at: ago(28, 0), type: 'country', rule: 'Skip New Zealand agencies until we have a local case study', evidence: '0 replies from 30 sends', source: 'monday report', status: 'retired', decided_at: ago(7, 0), decided_by: 'founder@tevrix.example' }),
      row('Playbook', { id: 'P-261026-1', added_at: ago(14, 0), type: 'angle', rule: 'Drop the recruiter_hire angle in Australia', evidence: '0 replies from 31 sends', source: 'monday report', status: 'rejected', decided_at: ago(13, 0), decided_by: 'founder@tevrix.example' })
    ]),
    Waitlist: [H.Waitlist].concat([
      row('Waitlist', { date: ago(16, 0), name: 'Rohan Mehta', company: 'Kitebird', role: 'Founder', country: 'India', channel: 'Instagram', what_they_asked: 'How do two founders run outreach to this many countries?', stage: 'Talked', notes: 'Wants to see the console' }),
      row('Waitlist', { date: ago(12, 0), name: 'Emma Clarke', company: 'Stackfield', role: 'COO', country: 'UK', channel: 'LinkedIn', what_they_asked: 'Could the same setup run our customer support?', stage: 'Asked', notes: '' }),
      row('Waitlist', { date: ago(9, 0), name: 'Daniel Okafor', company: 'Paylane', role: 'CEO', country: 'Nigeria', channel: 'Call', what_they_asked: 'Would pay to have this set up for our sales team', stage: 'Committed to pay', notes: 'Yes at $599 if it books 4 demos a month' }),
      row('Waitlist', { date: ago(5, 0), name: 'Mei Tan', company: 'Brightloop', role: 'Founder', country: 'Singapore', channel: 'Instagram', what_they_asked: 'Which tools are behind it?', stage: 'Asked', notes: '' }),
      row('Waitlist', { date: ago(2, 0), name: 'Lucas Ferreira', company: 'Rota Verde', role: 'Head of Growth', country: 'Brazil', channel: 'Instagram', what_they_asked: 'Is the dashboard for sale?', stage: 'Not a fit', notes: 'Agency, wants white label' })
    ]),
    Settings: [H.Settings].concat(settings)
  };

  root.__sample = { sheets: sheets, headers: H, id: id, ago: ago, MB: MB };
})(typeof window !== 'undefined' ? window : this);
