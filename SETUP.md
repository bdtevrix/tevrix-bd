# Setup — only the steps a person must do

Do these in order. Nothing sends to a real lead until step 17 (TEST_MODE stays TRUE until then). `outreachdomain.com` below stands for the domain you buy in step 1.

### Domain and mailbox (start first: warm-up takes 2–3 weeks)
1. **Buy the outreach domain** (a get-, try- or -hq variant of hireminds, about ₹1,000/year). Point its website at hireminds.tevrixai.com with a redirect so it looks real to anyone who checks.
2. **Workspace Admin → Account → Domains → Manage domains → Add a domain** → *Secondary domain* → verify with the TXT record Google gives you.
3. **Admin → Directory → Users → the BD user → Alternate email addresses** → add `team@outreachdomain.com`. In the BD account's Gmail, *Settings → Accounts → Send mail as*, check the alias appears (add it there if not).
4. **DNS at the registrar** (records for the outreach domain only; do not touch tevrixai.com):

   | Type | Host | Value |
   |---|---|---|
   | MX | `@` | `smtp.google.com` priority 1 (so replies to the alias arrive) |
   | TXT | `@` | `v=spf1 include:_spf.google.com ~all` |
   | TXT | `google._domainkey` | the DKIM key from **Admin → Apps → Google Workspace → Gmail → Authenticate email**, choosing the outreach domain → *Generate new record* (2048-bit). After it propagates (up to 48 h), click **Start authentication** |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@tevrixai.com; adkim=r; aspf=r` |

   Use any mailbox you read for `rua`; reports start arriving within a day or two.
5. **Google Postmaster Tools** (postmaster.google.com) → add the outreach domain → verify with its TXT record.
6. **Warm up 2–3 weeks**: send real emails from the alias to people you know, ramping 5 → 20 a day, and get replies. Do not run outreach until this is done.

### Sheet, GitHub, Google Cloud, Apify
7. **Sheet ownership**: from tevrixmarketing@tevrixai.com, Share → the BD account → *Make owner* (it already has access, which is enough to start).
8. **GitHub**: create the **private** repo `tevrix-bd` under the BD account (or your org), unzip `tevrix-bd.zip`, and push to `main`:
   ```bash
   cd tevrix-bd && git init -b main && git add . && git commit -m "Initial tevrix-bd" \
     && git remote add origin git@github.com:OWNER/tevrix-bd.git && git push -u origin main
   ```
   The `tests` workflow runs on push and should go green.
9. **Google Cloud** (console.cloud.google.com, signed in as BD): new project `tevrix-bd` → *APIs & Services → Enable APIs* → **Google Sheets API** → *Credentials → Create credentials → Service account* → open it → *Keys → Add key → JSON*. Then:
   - GitHub repo → *Settings → Secrets and variables → Actions*: secret `GOOGLE_SERVICE_ACCOUNT_JSON` = the whole JSON file's text; secret `SHEET_ID` = `1cDZcswzXjaxnZSlheKE-OulPlAy2Yzj3sPAlrv-qM7k`.
   - Share the Sheet with the service account's `…@….iam.gserviceaccount.com` address as **Editor**.
   - Delete the downloaded key file from your computer.
10. **Apify**: free account at apify.com → *Settings → API & Integrations* → copy the token → GitHub secret `APIFY_TOKEN`. (Without it every address is marked risky and nothing becomes sendable.)
11. **GitHub token for the Apps Script**: *GitHub → Settings → Developer settings → Fine-grained tokens → Generate*: repository access *Only select repositories → tevrix-bd*, permission **Actions: Read and write**, expiry 1 year (put a reminder in your calendar). Keep it for step 12.
12. **Apps Script**: open the Sheet as BD → *Extensions → Apps Script*.
    - Replace `Code.gs` with `apps-script/Code.gs`.
    - *Project Settings* → tick **Show "appsscript.json"** → replace it with `apps-script/appsscript.json`.
    - *Services (+)* → **Gmail API** (v1) if it is not already listed.
    - *Project Settings → Script Properties*: `GITHUB_TOKEN` = the token from step 11.
    - Reload the Sheet → menu **Tevrix BD → Install triggers** → approve the permissions (Google warns that the app is unverified because it is your own script: *Advanced → Go to project*).
13. **Fill Settings**: `SEND_AS` (team@outreachdomain.com), `MAILBOXES` (the BD account's address), `SENDER_NAME`, `POSTAL_ADDRESS`, `BOOKING_LINK`, `ALERT_EMAILS`, `GITHUB_OWNER`, `TEST_RECIPIENT` (your own address, **not** the BD account, or the reply test below will not register). Fill `FOUNDERS` (the two founders' first names, comma-separated) so Claude alternates LinkedIn requests between you.
14. **Booking page**: in the BD Google Calendar, *Create → Appointment schedule*, 15 minutes → copy the booking link into `BOOKING_LINK`.
15. **Founders**: review `claude/angles.md`, mark the angles you approve, and confirm the six items at its top (name, one-line promise, proof point, role fit, price, candidate disclosure). Record a 60-second proof video.

### First run and test
- **Dry run in GitHub**: *Actions → intake → Run workflow*, tick *Dry run*, limit `5`. Check the log and the CSV artifact.
- **Real intake**: *Tevrix BD → Run intake now* (or wait for 01:00 IST). New rows appear in **Leads** with status `new`. Then tell Claude in this account to create the scheduled tasks (morning research, evening replies, Monday report).
16. **Optional, Customer.io**: *Settings → API credentials → Tracking API keys* → add `CIO_SITE_ID` and `CIO_API_KEY` to Script Properties. Optional `CHAT_WEBHOOK` (Google Chat) for alerts there too.
17. **Test with TEST_MODE = TRUE**:
    1. *Tevrix BD → Send test email to me* → check the From name, alias, signature, opt-out line and postal address.
    2. Add a test row to **Outreach**: your own company, `country` UK, your email, `email_status` safe, a subject and `email_1`, `follow_up_1`. Set `decision` = approve; `stage` becomes approved and `mailbox` fills in.
    3. *Tevrix BD → Send now* (in TEST_MODE it ignores the 09:00–16:00 window). The email arrives at TEST_RECIPIENT with `[TEST]`; `stage` = sent_1 and `thread_id`, `message_id`, `sent_1_at` fill in.
    4. Change `sent_1_at` to 5 days ago → *Send now* → the follow-up arrives **in the same thread** as "Re: …".
    5. Reply to that thread from TEST_RECIPIENT → *Check replies now* → `stage` = replied, `reply_text` fills in, and an alert email arrives.
    6. Write something in `reply_draft`, set `reply_decision` = send → *Send now* → the reply arrives in the thread.
    7. Delete the test row. Then, and only once warm-up is done, set **TEST_MODE = FALSE**.

### Auto-deploy (once): GitHub puts every change live in Apps Script
After this, merging a pull request that touches `apps-script/` updates the Apps Script project and moves the console to the new version by itself (workflow `deploy-apps-script`, tests first). Nothing to paste.
1. Signed in as the BD account, open script.google.com/home/usersettings and switch **Google Apps Script API** on.
2. On your computer (needs Node.js), run `npx @google/clasp@2.4.2 login`, sign in as the BD account in the browser that opens, and allow. Then copy the token file: PowerShell `Get-Content $HOME\.clasprc.json | Set-Clipboard`, Mac `pbcopy < ~/.clasprc.json`.
3. GitHub repo → *Settings → Secrets and variables → Actions*:
   - *Secrets* → **New repository secret**: name `CLASPRC_JSON`, value = what you copied.
   - *Variables* → **New repository variable**: name `APPS_SCRIPT_ID`, value = Apps Script → *Project Settings* → **Script ID** (Copy).
4. *Actions → deploy-apps-script → Run workflow* to check it: the run ends green and the console shows the latest version.

`appsscript.json` from the repo replaces the one in the project on every deploy, so change scopes or services in the repo, not in the editor. Script Properties and triggers are not touched.
