# Tevrix BD Console

A web app over the "Tevrix BD — Outreach" Sheet. It runs as an Apps Script web app inside your Google Workspace, so it costs nothing, needs no server, and only people at tevrixai.com can reach it.

Everything you do in the console writes to the Sheet and is logged with your name in the Log tab. The Sheet stays the single source of truth. You can still edit it by hand.

## Two programmes

The switch at the top of the sidebar picks which programme you are working on. Every screen that lists leads or emails follows it, and the console remembers your choice. Press `P` to flip between them.

| Programme | What it is | How its rows are marked |
|---|---|---|
| **HireMinds** (violet) | Outreach for the AI interviewer, the product | every row that is not a partner row |
| **Tevrix services** (orange) | Commission-based sales agents who bring AI, website and automation clients | Outreach `angle` = `partner`; Leads `source` = `partner_scan` or `segment` = `partner` |

Today, Review, Replies, Pipeline, Leads and LinkedIn are filtered. Under Tevrix services the stages read Call booked, Agent signed and Deal closed instead of Demo booked, Beta client and Paying. Waitlist, Playbook and Controls are shared (the Playbook steers HireMinds research only). Today shows three 14-day bar charts (leads or agents found, emails sent, replies) in the programme's colour, and a card that puts both programmes side by side.

## What it does

| Screen | What you do there |
|---|---|
| Today | Three 14-day charts and a side-by-side of both programmes, what needs you, sent today against the cap, reply rate (30 days, against the 3% target), bounce rate, the funnel, the Run on AI gates, which angle and country is working, and recent activity |
| Review | Three tabs: To review, Approved (waiting for the next send run) and Skipped. Go through Claude's drafts one by one. Edit the subject, email and follow-ups. Approve, skip, or send it on LinkedIn instead. Live checks show subject length, word count, links, and whether the email has a question. "As sent" shows the email with the signature, in test mode or live |
| Replies | Read each reply and fix Claude's label. Edit the drafted answer, add the booking link, send it, and mark the outcome: demo, beta, paying, not now, lost or do not contact |
| Pipeline | Two lanes. Sequence (Approved, Email 1, Follow-up 1, Follow-up 2) runs by itself and shows each lead's next send date. Conversations (Replied, Demo booked, Beta client, Paying) are yours: drag a card to change its stage, or drop it on Not now or Lost. Every column scrolls on its own. Cards flag what needs you: replies you haven't answered, deals with no update in 10+ days, and emails that are late. Filter by angle, country or Needs you, or switch to List for a sortable table. On a phone you pick one stage at a time from a strip that stays pinned under the menu, and you move cards from their details panel |
| Leads | Search and filter. Park the leads you do not want. Add a referral or inbound lead by hand |
| LinkedIn | The people to connect with by hand. Copy the note, check its length, pick who sends it, and tick Sent and Accepted |
| Waitlist | Founders who asked how Tevrix runs on AI, with the gate targets: 10 asking, 2–3 committing to pay |
| Playbook | The rules Claude follows on top of its instructions. Every Monday Claude proposes rules from your skip reasons, your edits to its drafts and the reply numbers. Approve, reject or retire them, or add your own. Nothing changes until a founder approves it |
| Controls | Pause or resume sending. Test mode has a go-live checklist. Run any step now. Edit the limits, sender, signature and access. Manage do not contact. Full activity log |

Keys: `1`–`9` switch screens. In Review, `J`/`K` move, `A` approves, `S` skips (then `1`–`6` picks why), `L` sends on LinkedIn, `E` edits and `Ctrl S` saves. `R` refreshes, `P` switches between HireMinds and Tevrix services, `[` collapses or opens the sidebar, `?` lists the keys, and `Esc` closes panels. The sidebar remembers whether you left it open.

Safety built in:
- Only addresses marked `safe` can be approved.
- Do-not-contact is checked on every approve and every reply, and adding an address or `@domain` stops any open sequence.
- Sent emails cannot be edited.
- The first time you change a draft, Claude's original is kept in `original_email`, so the Monday report can learn from what you changed.
- Approve and skip have Undo until the first email goes out.
- Unsaved edits survive refreshes.
- Test mode can only be switched off after the four checks are ticked and you type GO LIVE.

## Install (10 minutes, signed in as the BD account)

1. Open the Sheet, then Extensions → Apps Script. This is the same project that holds `Code.gs`.
2. Add a script file named `Web` and paste `Web.gs` into it.
3. Add an HTML file named `Dashboard` (exactly that name) and paste `Dashboard.html` into it.
4. Open Project Settings and tick "Show appsscript.json". Then open `appsscript.json` and add the `webapp` block from the file here. Keep everything else that is already there.
5. If `Code.gs` already has a function named `doGet`, rename that one. A project can only have one `doGet`.
6. Deploy → New deployment → type: Web app.
   - Execute as: **Me** (the BD account)
   - Who has access: **Anyone within tevrixai.com**
7. Authorise when asked, then open the web app URL. Bookmark it, and add it to your phone's home screen.

After a code change, use Deploy → Manage deployments → Edit → New version. Doing it this way keeps the URL the same.

## Who can open it

- Anyone who can edit the Sheet.
- The BD account.
- Anyone listed in Settings → `DASHBOARD_USERS`, comma-separated. That row has been added to the Settings tab.

Everyone else sees a "No access" page. People outside tevrixai.com cannot reach the URL at all.

## The Run buttons

The Run buttons call the automation's own functions in `Code.gs`. These are the same functions the timers run:

| Button | Function it looks for |
|---|---|
| Find leads | `dispatchIntake` |
| Send due emails | `sendTick` |
| Check replies | `checkTick` |
| Send a test email | `sendTestEmail` |

If your `Code.gs` uses other names, change them in `UI_RUN` at the top of `Web.gs`. A button whose function is missing says "Not installed" and does nothing. If the function returns `{ message: '...' }`, that text shows in the console.

## How it fits with Code.gs

- **Approve** writes `decision = approve`, `stage = approved`, `decided_at`, and a `mailbox`. The mailbox is the one in `MAILBOXES` with the fewest active sequences. It does this directly because an onEdit trigger does not fire on edits a script makes. If your `onEdit` approval does more than that, copy the extra step into `uiDecide` in `Web.gs`.
- **Send answer** sets `reply_decision = send`. The next send run sends it in the thread, just as if you had picked it in the Sheet.
- **Lead ids** for hand-added leads are `L-` followed by the first 8 hex characters of the SHA-1 of the lowercased domain, or of the company name if there is no website. This is the same scheme the lead finder uses, so duplicates match.
- **New rows** (LinkedIn, Leads, Waitlist, Do not contact) go straight after the last real row. Checkbox columns fill a tab with FALSE all the way down, so a plain appendRow would put them at row 1001.
- **Changing a reply's label** never moves the lead's stage.
- **Text that starts with `=`, `+`, `-` or `@`** is written with a leading apostrophe, so the Sheet keeps it as text instead of showing `#ERROR!`.

## Files

```
apps-script/Web.gs            server side: every function the page calls checks access first
apps-script/Dashboard.html    the console: one file, no libraries, light and dark, works on a phone
apps-script/appsscript.json   manifest with the webapp block
preview/                      a fake Apps Script, sample data, and stand-ins for Code.gs, used by the preview and tests
build_preview.py              builds dist/preview.html: the real Web.gs and Dashboard.html running on sample data
tests/test_server.js          22 server tests: node tests/test_server.js
tests/ui_test.js              browser checks on desktop and phone, light and dark, and on an empty Sheet: node tests/ui_test.js
```
