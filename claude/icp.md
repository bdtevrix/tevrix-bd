# Ideal customer profile — HireMinds

Score each lead 1–5. Write the score in `score` and one line in `fit_reason`.

## Segments
1. **Scaling SMEs**, 20–500 staff, hiring now (3+ roles in 7 days or a recruiter/HR hire).
2. **Recruitment and staffing agencies**, any size, best with volume desks.
3. **High-volume hirers**: retail, hospitality, BPO / contact centres, field sales, care staffing.

## Markets
- Wave 1 (now): UK, Ireland, UAE, Singapore, Australia, New Zealand.
- Wave 2 (later): United States (needs POSTAL_ADDRESS filled), Canada.
- Wave 3: India at a local price tier.
- Germany, Austria, Netherlands: never drafted for automatic sending. Park them with the note "EU opt-in: by hand".

## Scoring
| Score | Meaning |
|---|---|
| 5 | Segment fit, Wave 1, 5+ open roles or hiring a recruiter, and a named HR/TA/founder contact with a safe email |
| 4 | Segment fit, Wave 1, 3+ roles, contact known |
| 3 | Fit is plausible but one thing is weak (generic contact, unclear size, roles mostly senior/technical) |
| 2 | Weak fit: very senior roles only, under 20 staff, or a large enterprise |
| 1 | Not a fit: government, education, a competitor, an ATS/HR-tech vendor, or a job board |

Below 3 → park the lead (Leads.status `parked`, reason in `notes`).

## Red flags (park)
- 1,000+ staff or a household-name enterprise.
- Public sector, schools, universities, NHS.
- HR-tech, ATS or AI-interview companies (competitors).
- Postings are all by a third-party agency on their behalf.
- Recent layoffs or hiring freeze in the news.
