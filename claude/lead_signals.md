# Lead signals — what to look for, and how much each one counts

Read by the morning research task (`research_prompt.md`, steps 2b and 2f). The ideas come from the
`lead-signals` skill in superdesigndev/treg (Apache 2.0): sort signals by type, keep only fresh ones,
rank by fit, then timing, then strength. That skill runs on treg, a paid API. This version uses only
web search, company websites and public job boards, so it costs nothing extra and needs no new account.

Nothing here overrides the hard rules in `research_prompt.md`: the Sheet rules, the country rule for
email, Do not contact, never guessing an address, never inventing a fact, the product-claim limits and
the approved Playbook rules.

## Signal types

| Signal | Where to look | Keep if | Drop if | Fresh for |
|---|---|---|---|---|
| **Volume hiring** | careers page, `job_urls`, Indeed, Naukri, LinkedIn Jobs, YC jobs | 3+ open roles of the same kind (agents, associates, HCAs, operators, store staff, BDAs), or the same role reposted | only senior or specialist roles, or posts placed by an agency for a client you cannot name | 30 days |
| **Walk-in drive** (India) | Naukri, company pages | a dated drive in the next 2 weeks or in the last 2 weeks | the drive has passed and no new one is posted | 14 days |
| **Recruiter or HR hire** | careers page, job boards | an open recruiter, TA, talent or HR role | the role is closed | 30 days |
| **New people leader** | news, press releases, the company's team page | a new Head of People, HR, TA or Ops in the last 90 days | it is a rumour or you can only find it on LinkedIn | 90 days |
| **Funding** | news, the company's blog | a round in the last 6 months, and the company says it will hire | the round is older than 6 months | 6 months |
| **Expansion** | news, the company's site | new sites, stores, plants, hotels or homes, or a "X new jobs" announcement | the plans are vague, with no date | 6 months |
| **Headcount growth** | company pages, reputable trackers | a dated figure (e.g. "up 40% in 6 months") | the figure has no source | 6 months |
| **Screening pain** | public posts by the company's HR people or founders (web search of LinkedIn, X or Reddit) | they write publicly about too many applicants, no-shows, slow screening or a hiring push | the post is anonymous, private, or not by the company's own people | 60 days |
| **Tool in use** | job-post apply links (Workable, SmartRecruiters, Ashby, Greenhouse) | use it as dossier context only | never put it in an email: we make no integration claims | — |

**Negative signals** (park the lead, reason in `notes`): layoffs, a hiring freeze, site closures, a
pivot away from the business you found, or a "not hiring" notice on their own site. Use the most
recent one: a freeze from last year followed by a hiring push this month is not a freeze.

## How signals change the run

1. **Fit sets the score.** Score with the ICP table in `research_prompt.md` exactly as before. Signals
   never lift a lead that fails the ICP (wrong size, wrong segment, competitor, red flag).
2. **Timing and strength decide ties and the weak point.**
   - When the only hiring signal is older than its "fresh for" window, count it as the one weak point
     (a 4 becomes a 3). If you cannot find any current signal, use 2 at most.
   - Two independent signals beat one: for example, volume roles plus a recruiter hire, or funding
     plus expansion. When two leads have the same score, put the one with more fresh, independent
     signals first, both for working order and for the LinkedIn tab's top 10–15.
3. **The hook is the freshest strong signal.** Open `email_1` with it. Prefer, in order: volume hiring
   or a walk-in drive, a recruiter hire, a new people leader, expansion, funding, screening pain.
   Use a screening-pain post only to choose the angle and the opening. Do not quote it, and do not
   say you read their post unless it is clearly public and about hiring.
4. **Record what you used.** In `dossier`, list each signal on its own line with its type, date and
   URL, e.g. `hiring: 5x Business Development Associate (ycombinator.com/companies/codingal/jobs, 11 Nov 2026)`.
   Write the strongest one into Leads `signal` when that column is empty or out of date.
5. **No signal, no draft hook.** If nothing is fresh, write `needs a human line` in `reviewer_notes`,
   as before.

## Looking for new signals on existing leads

For leads from `founder_list` or `news_scan` that have no job-board signal (step 2b), search for the
signal types in this order: volume hiring, walk-in drive, recruiter hire, expansion, funding. Stop at
the first fresh one you can date and source.
