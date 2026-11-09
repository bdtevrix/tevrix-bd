"""Hiring-signal intake: JobSpy -> per-company aggregation -> filters -> lead candidates."""
from __future__ import annotations

import logging
import random
import re
import time
from collections import Counter
from datetime import datetime, timezone

import pandas as pd

from .domains import company_domain, lead_id, normalise_company, website_url

log = logging.getLogger(__name__)

# JobSpy column names have changed between versions; read them through these aliases.
COLS = {
    "company": ["company", "company_name"],
    "title": ["title", "job_title"],
    "job_url": ["job_url", "job_url_direct", "url"],
    "site": ["site", "board"],
    "size": ["company_num_employees", "company_employees_label", "company_size", "num_employees"],
    "website": ["company_url_direct", "company_website"],
    "ceo": ["ceo_name"],
    "industry": ["company_industry", "industry"],
    "revenue": ["company_revenue"],
}


def _get(row, key: str) -> str:
    for col in COLS[key]:
        if col in row and row[col] is not None:
            val = row[col]
            try:
                if pd.isna(val):
                    continue
            except (TypeError, ValueError):
                pass
            s = str(val).strip()
            if s and s.lower() not in {"nan", "none", "null"}:
                return s
    return ""


# ---------------------------------------------------------------- size parsing

def parse_size(label: str) -> tuple[int, int] | None:
    """'11 to 50' -> (11, 50); '201-500 employees' -> (201, 500); '10,000+' -> (10000, inf-ish)."""
    if not label:
        return None
    s = str(label).lower().replace(",", "")
    nums = [int(n) for n in re.findall(r"\d+", s)]
    if not nums:
        return None
    if len(nums) >= 2:
        lo, hi = sorted(nums[:2])
        return lo, hi
    n = nums[0]
    if "+" in s or "more" in s or "over" in s:
        return n, 10**9
    if "less" in s or "under" in s or "fewer" in s or "<" in s:
        return 0, n
    return n, n


def size_ok(label: str, size_min: int, size_max: int) -> bool:
    """Keep 20-500 staff when the size is parseable; unknown size is kept."""
    rng = parse_size(label)
    if rng is None:
        return True
    lo, hi = rng
    return hi >= size_min and lo <= size_max


# ---------------------------------------------------------------- classification

def classify_segment(company: str, agency_keywords: list[str]) -> str:
    name = normalise_company(company)
    return "agency" if any(re.search(rf"\b{re.escape(k)}\b", name) for k in agency_keywords) else "smb"


def is_high_intent(title: str, high_intent_terms: list[str]) -> bool:
    t = (title or "").lower()
    extra = ["talent acquisition", "recruitment", "head of people", "people partner", "hr business partner"]
    return any(term.lower() in t for term in list(high_intent_terms) + extra)


def is_excluded(company: str, domain: str, exclude: list[str]) -> bool:
    hay = f"{normalise_company(company)} {domain}".lower()
    return any(x.lower() in hay for x in exclude)


# ---------------------------------------------------------------- scraping

def scrape(cfg: dict, limit_searches: int | None = None) -> pd.DataFrame:
    """Run JobSpy for every country x board x term. Errors are caught per call."""
    from jobspy import scrape_jobs  # imported here so tests do not need jobspy

    js = cfg["jobspy"]
    terms = cfg["search_terms"]["high_intent"] + cfg["search_terms"]["volume"]
    frames, done = [], 0
    for c in cfg["countries"]:
        for board in c["boards"]:
            for term in terms:
                if limit_searches is not None and done >= limit_searches:
                    break
                done += 1
                kwargs = dict(
                    site_name=[board],
                    search_term=term,
                    results_wanted=js["results_wanted"],
                    hours_old=js["hours_old"],
                    country_indeed=c["country_indeed"],
                    verbose=0,
                )
                if board == "linkedin":
                    kwargs["location"] = c["linkedin_location"]
                    kwargs["linkedin_fetch_description"] = js.get("linkedin_fetch_description", False)
                elif board == "indeed":
                    kwargs["location"] = c["country_indeed"]
                elif board == "google":
                    kwargs["google_search_term"] = f"{term} jobs in {c['linkedin_location']} since last week"
                try:
                    df = scrape_jobs(**kwargs)
                    if df is not None and len(df):
                        df = df.copy()
                        df["search_term"] = term
                        df["country_code"] = c["code"]
                        df["board"] = board
                        frames.append(df)
                    log.info("%s %s %r: %d rows", c["code"], board, term, 0 if df is None else len(df))
                except Exception as exc:  # one bad board must not stop the night
                    log.warning("%s %s %r failed: %s", c["code"], board, term, str(exc)[:200])
                time.sleep(random.uniform(*js["pause_seconds"]))
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


# ---------------------------------------------------------------- aggregation

def aggregate(df: pd.DataFrame, cfg: dict) -> list[dict]:
    """Group job rows into one record per normalised company name."""
    if df is None or df.empty:
        return []
    high = cfg["search_terms"]["high_intent"]
    companies: dict[str, dict] = {}
    for _, row in df.iterrows():
        name = _get(row, "company")
        key = normalise_company(name)
        if not key:
            continue
        rec = companies.setdefault(key, {
            "company": name, "key": key, "titles": [], "job_urls": [], "boards": set(),
            "size": "", "website": "", "ceo_name": "", "industry": "", "revenue": "", "countries": Counter(),
            "high_intent_titles": [],
        })
        board = _get(row, "site") or str(row.get("board", "") or "")
        if board:
            rec["boards"].add(board)
        title = _get(row, "title")
        url = _get(row, "job_url")
        if url and url in rec["job_urls"]:
            continue  # same posting seen under two search terms or boards
        if title:
            rec["titles"].append(title)
            if is_high_intent(title, high):
                rec["high_intent_titles"].append(title)
        if url:
            rec["job_urls"].append(url)
        for field, col in (("size", "size"), ("ceo_name", "ceo"), ("industry", "industry"), ("revenue", "revenue")):
            if not rec[field]:
                rec[field] = _get(row, col)
        if not rec["website"]:
            rec["website"] = website_url(_get(row, "website"))
        cc = str(row.get("country_code", "") or "")
        if cc:
            rec["countries"][cc] += 1
    out = []
    for rec in companies.values():
        rec["open_roles"] = len(rec["titles"])
        rec["boards"] = sorted(rec["boards"])
        rec["country_code"] = rec["countries"].most_common(1)[0][0] if rec["countries"] else ""
        rec["domain"] = company_domain(rec["website"])
        out.append(rec)
    return out


def signal_text(rec: dict) -> str:
    """'5 open roles in 7 days (Sales Executive, Customer Service…); hiring a recruiter'."""
    uniq = list(dict.fromkeys(rec["titles"]))
    sample = ", ".join(uniq[:3]) + ("…" if len(uniq) > 3 else "")
    n = rec["open_roles"]
    s = f"{n} open role{'s' if n != 1 else ''} in 7 days ({sample})"
    if rec["high_intent_titles"]:
        t = rec["high_intent_titles"][0].lower()
        what = "a recruiter" if "recruit" in t or "talent" in t else "HR / people"
        s += f"; hiring {what}"
    return s


def filter_candidates(
    companies: list[dict],
    cfg: dict,
    existing_domains: set[str] = frozenset(),
    existing_names: set[str] = frozenset(),
    dnc_domains: set[str] = frozenset(),
    limit: int | None = None,
) -> list[dict]:
    """Apply the keep rules and dedupe. Returns Leads-shaped dicts, best signal first."""
    f = cfg["filters"]
    labels = cfg.get("country_labels", {})
    kept = []
    for rec in companies:
        if not (rec["open_roles"] >= f["min_roles"] or rec["high_intent_titles"]):
            continue
        if not size_ok(rec["size"], f["size_min"], f["size_max"]):
            continue
        if is_excluded(rec["company"], rec["domain"], f.get("exclude", [])):
            continue
        if rec["domain"] and (rec["domain"] in existing_domains or rec["domain"] in dnc_domains):
            continue
        if rec["key"] in existing_names:
            continue
        kept.append(rec)
    # Most roles first, high-intent breaks ties.
    kept.sort(key=lambda r: (r["open_roles"], bool(r["high_intent_titles"])), reverse=True)
    cap = min(limit or f["max_new_leads_per_run"], f["max_new_leads_per_run"])
    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
    leads = []
    for rec in kept[:cap]:
        uniq = list(dict.fromkeys(rec["titles"]))
        notes = []
        if rec["industry"]:
            notes.append(f"industry: {rec['industry']}")
        if rec["revenue"]:
            notes.append(f"revenue: {rec['revenue']}")
        if rec["boards"]:
            notes.append("boards: " + ", ".join(rec["boards"]))
        leads.append({
            "lead_id": lead_id(rec["domain"], rec["company"]),
            "found_at": now,
            "source": "jobspy",
            "segment": classify_segment(rec["company"], cfg["agency_keywords"]),
            "company": rec["company"],
            "domain": rec["domain"],
            "website": rec["website"],
            "country": labels.get(rec["country_code"], rec["country_code"]),
            "company_size": rec["size"],
            "open_roles": rec["open_roles"],
            "roles_sample": "; ".join(uniq[:5]),
            "signal": signal_text(rec),
            "job_urls": "\n".join(rec["job_urls"][:5]),
            "ceo_name": rec["ceo_name"],
            "status": "new",
            "notes": "; ".join(notes),
        })
    return leads
