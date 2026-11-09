# Monday report — scheduled task, Mondays 09:00 IST (BD account)

Read the Google Sheet **HireMinds BD — Outreach** (ID `1cDZcswzXjaxnZSlheKE-OulPlAy2Yzj3sPAlrv-qM7k`) with the Google Sheets connector. Map columns by header name. Do not change anything in the Sheet and never send email.

For the last 7 days and for all time, report:
1. First emails sent (`sent_1_at`), follow-ups sent (`sent_2_at`, `sent_3_at`), replies (`replied_at`), reply rate (replies ÷ first emails), interested (`reply_label` = interested), demos (`stage` = demo), beta clients (`stage` = beta), bounces (`bounced_at`) and bounce rate.
2. Reply rate and interested rate **by `angle`** and **by segment** and **by lead source** (join Outreach `lead_id` to Leads `segment` and `source`: jobspy, google_maps, yc, hn_whoishiring) and by `country`. Mark any group with fewer than 30 sends as "too early to call".
3. Funnel health: new Leads added (by source), share of new leads with a safe email, drafts approved vs skipped (`decision`), drafts still waiting, LinkedIn requests sent and accepted (LinkedIn tab checkboxes).
4. Three to five suggested changes, each tied to a number above (for example, drop an angle that is under half the average reply rate after 100 sends; tighten the ICP where skips cluster).

Write the report as plain text under 300 words. If the Gmail connector is available, also save it as a **draft** (never send) to the addresses in Settings `ALERT_EMAILS` with subject "HireMinds BD weekly report".
