# tevrix-bd

Lead intake for HireMinds outreach. GitHub Actions finds companies that are hiring and recruitment agencies, finds and verifies a contact, and appends rows to the **Leads** tab of the Google Sheet *HireMinds BD — Outreach*. Nothing here sends email: the Apps Script in `apps-script/` sends only what a founder approved in the Sheet.

```
Apps Script (01:00 IST) ──dispatch──▶ intake.yml / agencies.yml ──▶ Leads tab (status new)
Claude (06:00) researches and drafts ──▶ Outreach tab (stage drafted) ──▶ founder approves
Apps Script (every 15 min) sends approved emails and follow-ups; hourly checks replies, bounces, unsubscribes
Claude (19:00) labels replies and drafts answers ──▶ founder sets reply_decision = send
```

## Layout
| Path | What it does |
|---|---|
| `config/search.yaml` | Countries, boards, search terms, filters, Maps queries, crawler and Apify settings |
| `schema/headers.json` | The Sheet's column names. Python, Apps Script and tests all check against it |
| `bd/intake_jobs.py` | JobSpy (Indeed, LinkedIn, Bayt) → one record per company → keep rules → lead candidates |
| `bd/intake_maps.py` | Parses the gosom Google Maps CSV into agency leads |
| `bd/contacts.py` | Crawls up to 6 pages per site (robots.txt respected), extracts emails and people, infers the email pattern, picks the contact |
| `bd/osint.py` | ColdReach (`--quick --no-reacher`, no port 25) and theHarvester (no-key sources) for leads the crawl could not solve; secrets are stripped from their environment |
| `bd/verify.py` | MX check for published / pattern-confirmed / role addresses; Apify `pnda~email-finder` for guesses |
| `bd/sheets.py` | gspread with a service account; reads and appends by header name, `RAW` so nothing is evaluated as a formula |
| `bd/main.py` | CLI |
| `apps-script/` | `Code.gs` and `appsscript.json` to paste into the Sheet's Apps Script editor |
| `claude/` | Claude's scheduled-task prompts, voice rules, ICP and the outreach angles (draft) |
| `SETUP.md` | The steps only a person can do, in order |

## CLI
```bash
pip install -r requirements.txt          # Python 3.10+
python -m bd.main jobs --dry-run --limit 5 --searches 6   # quick test, no Sheet writes
python -m bd.main jobs                    # full nightly run
python -m bd.main maps-queries --out queries.txt
python -m bd.main maps results.csv [--dry-run]
python -m bd.main check-sheet             # live headers vs schema/headers.json
```
Environment: `GOOGLE_SERVICE_ACCOUNT_JSON` (the key's JSON text, or a path), `SHEET_ID`, `APIFY_TOKEN` (optional). A dry run without Sheet credentials skips dedupe against Leads.
Every run writes its leads to `out/<kind>-<timestamp>.csv`, uploaded as a workflow artifact.

## Rules the code applies
- **Keep a company** with 3+ roles in 7 days, or any high-intent role (talent acquisition, recruiter, HR manager, people operations). Size 20–500 when the board gives it; unknown size is kept. Names in `filters.exclude` are dropped.
- **Segment** `agency` when the name contains recruitment, staffing, talent, resourcing, search, personnel; otherwise `smb`.
- **Dedupe** against Leads (domain or normalised name) and Do not contact (`@domain`). At most 60 new leads per run.
- **email_source**: `published` (the person's own address is on the site), `pattern-confirmed` (a colleague's address proves the pattern), `role-address` (careers@, jobs@, hr@, talent@, recruitment@, people@), `pattern-guess` (name known, pattern not; Apify finds it), `none`.
- **email_status**: published / pattern-confirmed / role-address → `safe` if the domain has MX records. Pattern-guess → Apify `found` = `safe`, `catch-all` = `risky`, anything else = `bad` (falls back to a published role address if there is one). **With no `APIFY_TOKEN`, every address is `risky`** (the build spec's rule), so no lead becomes sendable until the token is set.
- **Extra finders**: when the crawl finds no published or pattern-confirmed address, ColdReach and theHarvester add any same-domain emails they find, and the contact is picked again. A colleague's address from them can confirm the pattern. Their names are written to `notes` (source kept for DPDP). Capped at 20 domains and 10 minutes per run; GitHub Free gives private repos 2,000 minutes a month.
- **Indeed extras**: company size and revenue are kept (`company_size`, `notes`). JobSpy 1.4.1 no longer returns a CEO name, so `ceo_name` is usually blank; the crawl and Claude's research fill the contact instead.
- `lead_id` = `L-` + 8 hex characters of SHA-1 of the domain (or the normalised company name).

## Workflows
`intake.yml` and `agencies.yml` are `workflow_dispatch` only: the Apps Script starts them at 01:00 IST, because scheduled runs on private Free-plan repos have been unreliable. Both have a 45-minute timeout and a concurrency group, and take a `dry_run` input. `tests.yml` runs on push.

If job boards block GitHub's runner IPs, JobSpy accepts `proxies`; the fallbacks are Apify's free credit or a small Oracle box. Claude's chat workspace usually cannot reach job boards, so live scraping is tested in Actions.

## Tests
```bash
python -m pytest -q
```
Covers domain normalisation, size parsing, aggregation on a fake DataFrame, keep and dedupe rules, email and people extraction, pattern inference, email building, the verification rules, the Maps CSV parser, `node --check` on `Code.gs`, Apps Script helpers, and that the column names in Python, Apps Script and Claude's prompts all match `schema/headers.json`.

## Not used, and why
OpenLeads (non-commercial licence), self-hosted Reacher (needs outbound port 25), any LinkedIn automation or cookie-based scraper (account ban risk), Glassdoor and ZipRecruiter boards (frequent 400/403 errors). Customer.io gets only opted-in people (beta clients), never scraped leads.
