# Monday report — scheduled task, Mondays 09:00 IST (BD account)

Read the Google Sheet **HireMinds BD — Outreach** (ID `1cDZcswzXjaxnZSlheKE-OulPlAy2Yzj3sPAlrv-qM7k`) with the Google Sheets connector. Map columns by header name. Never send email. The only change you may make to the Sheet is appending rows to the **Playbook** tab (step 5); everything else is read only.

For the last 7 days and for all time, report:
1. First emails sent (`sent_1_at`), follow-ups sent (`sent_2_at`, `sent_3_at`), replies (`replied_at`), reply rate (replies ÷ first emails), interested (`reply_label` = interested), demos (`stage` = demo), beta clients (`stage` = beta), bounces (`bounced_at`) and bounce rate.
2. Reply rate and interested rate **by `angle`**, **by segment** and **by lead source** (join Outreach `lead_id` to Leads `segment` and `source`: jobspy, google_maps, yc, hn_whoishiring, founder_list, news_scan) and by `country` (India is now a main market: show it first). Mark any group with fewer than 30 sends as "too early to call".
3. Funnel health: new Leads added (by source and by country), share of new leads with a safe email, leads parked and the most common park reasons, "partner idea" notes, drafts approved vs skipped (`decision`), drafts still waiting, LinkedIn requests sent and accepted (LinkedIn tab checkboxes).
4. **What the founders are teaching you** (last 28 days):
   - **Skips**: count the Outreach rows with `decision` = skip by `skip_reason` (wrong_person, size, weak_hook, wrong_country, not_a_fit, other, or blank), and for the top reasons, what the skipped rows have in common (segment, country, size, contact title, angle, source).
   - **Edits**: for rows with `original_email` filled (a JSON object with Claude's `subject`, `email_1`, `follow_up_1`, `follow_up_2` before a founder changed them), compare it with the current text. Look for patterns: words or lines the founders cut or add, length before and after, subject changes, a different opening or close.
   - **Rules in use**: for each Playbook row with `status` = `approved`, the sends and reply rate of drafts whose `reviewer_notes` mention `playbook <id>`, against everyone else.
5. **Propose Playbook rules.** Read the whole **Playbook** tab first. Then append at most **5** new rows, only where the evidence clears one of these bars:
   - from skips: 5 or more skips in 28 days with the same reason and a shared trait;
   - from edits: 3 or more drafts edited the same way;
   - from reply numbers: at least 30 first emails in each group compared, and a clear gap (for example one group at twice the other's reply rate);
   - retiring a rule: an approved rule whose drafts have 30+ sends and a reply rate under half of everyone else's. Propose a new row that says "Retire <id>: <why>", type `other`.
   Do not propose a rule that repeats or contradicts one already in the tab with status `proposed`, `approved` or `rejected` (a rejected rule stays rejected unless the numbers have clearly changed: then say so in `evidence`). A rule must never ask the morning research to break its hard rules: the country rule for email, Do not contact, guessed addresses, invented facts, or claims about the product.
   Each row, in the tab's header order:
   - `id`: `P-` + today as YYMMDD + `-` + a number from 1 (e.g. P-261116-1)
   - `added_at`: now in IST as YYYY-MM-DD HH:MM
   - `type`: one of segment, country, angle, writing, contact, example, other
   - `rule`: one plain sentence the morning research can follow, e.g. "Park UK agencies with fewer than 20 staff" or "Keep email 1 under 70 words"
   - `evidence`: one line with the numbers, e.g. "7 of 9 UK agency skips in 28 days were 'size', all under 20 staff"
   - `source`: `skips`, `edits` or `monday report` (for reply-rate rules)
   - `status`: `proposed`; leave `decided_at` and `decided_by` blank. Only a founder approves, in the console.

Before any email has been sent, report only the lead and draft numbers in item 3 and the skips and edits in item 4, and say that reply data starts once sending begins.

Write the report as plain text under 350 words, ending with the rules you proposed (or "no new rules: not enough evidence yet") and a reminder that they wait in the console's Playbook screen. If the Gmail connector is available, also save it as a **draft** (never send) to the addresses in Settings `ALERT_EMAILS` with subject "Tevrix BD weekly report".
