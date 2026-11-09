"""Startup intake: YC companies that are hiring, and the monthly Hacker News "Who is hiring?" thread.

Both are free, public sources:
  * YC: the open yc-oss/api dataset (refreshed daily from YC's public directory), file companies/hiring.json
  * Hacker News: the official Algolia HN API

Startups are a beta-customer segment: founders reply to cold email, decide fast and give feedback.
"""
from __future__ import annotations

import html
import logging
import re
from datetime import datetime, timezone

from .domains import company_domain, lead_id, normalise_company, website_url
from .intake_jobs import is_excluded
from .websites import domain_matches

log = logging.getLogger(__name__)

YC_URL = "https://raw.githubusercontent.com/yc-oss/api/gh-pages/companies/hiring.json"
HN_SEARCH = "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=6"
HN_ITEM = "https://hn.algolia.com/api/v1/items/{id}"

# YC region names -> the country labels used in the Sheet.
YC_REGIONS = {
    "United Kingdom": "UK", "Ireland": "Ireland", "Australia": "Australia", "New Zealand": "New Zealand",
    "Singapore": "Singapore", "United Arab Emirates": "UAE",
}

# Place names in an HN post's first line -> country label. Matched as whole words.
HN_PLACES = {
    "london": "UK", "uk": "UK", "united kingdom": "UK", "england": "UK", "manchester": "UK", "edinburgh": "UK",
    "cambridge, uk": "UK", "bristol": "UK", "glasgow": "UK", "leeds": "UK", "oxford": "UK", "belfast": "UK",
    "dublin": "Ireland", "ireland": "Ireland", "cork": "Ireland", "galway": "Ireland",
    "sydney": "Australia", "melbourne": "Australia", "brisbane": "Australia", "perth": "Australia",
    "australia": "Australia", "auckland": "New Zealand", "wellington": "New Zealand", "new zealand": "New Zealand",
    "singapore": "Singapore", "dubai": "UAE", "abu dhabi": "UAE", "uae": "UAE",
}


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")


def _skip(company: str, domain: str, cfg: dict, keys: dict, seen: set) -> bool:
    key = normalise_company(company)
    if not key or key in seen or key in keys.get("names", set()):
        return True
    if domain and (domain in keys.get("domains", set()) or domain in keys.get("dnc_domains", set())):
        return True
    if is_excluded(company, domain, cfg["filters"].get("exclude", [])):
        return True
    seen.add(key)
    return False


# ---------------------------------------------------------------- YC

def parse_yc(records: list[dict], cfg: dict, keys: dict, limit: int) -> list[dict]:
    s = cfg.get("startups", {})
    lo, hi = s.get("team_min", 15), s.get("team_max", 200)
    seen: set = set()
    out = []
    # Larger teams first (more roles open), up to team_max where founders still screen candidates.
    records = sorted(records, key=lambda r: (r.get("team_size") or 0), reverse=True)
    for r in records:
        if r.get("status") not in (None, "Active") or not r.get("isHiring", True):
            continue
        size = r.get("team_size") or 0
        if not (lo <= size <= hi):
            continue
        country = next((YC_REGIONS[x] for x in (r.get("regions") or []) if x in YC_REGIONS), "")
        if not country:
            continue
        name = (r.get("name") or "").strip()
        domain = company_domain(r.get("website") or "")
        if _skip(name, domain, cfg, keys, seen):
            continue
        out.append({
            "lead_id": lead_id(domain, name),
            "found_at": _now(),
            "source": "yc",
            "segment": "startup",
            "company": name,
            "domain": domain,
            "website": website_url(r.get("website") or ""),
            "country": country,
            "company_size": f"{size} staff",
            "signal": f"YC {r.get('batch', '')} startup, hiring now, team of {size}".replace("YC  ", "YC "),
            "job_urls": r.get("url", ""),
            "status": "new",
            "notes": "; ".join(x for x in (
                (r.get("one_liner") or "").strip(),
                f"industry: {r.get('industry')}" if r.get("industry") else "",
                f"locations: {r.get('all_locations')}" if r.get("all_locations") else "",
            ) if x),
        })
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------- Hacker News

def strip_html(text: str) -> str:
    t = re.sub(r"<p>", "\n", text or "", flags=re.I)
    t = re.sub(r"<br\s*/?>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return html.unescape(t).replace(" ", " ")


def hn_country(first_line: str) -> str:
    low = first_line.lower()
    if re.search(r"\b(us|usa|u\.s\.)\s*only\b|\bremote\s*\(us\b", low):
        return ""
    for place, country in HN_PLACES.items():
        if re.search(rf"(?<![a-z]){re.escape(place)}(?![a-z])", low):
            return country
    return ""


def parse_hn_post(raw_html: str) -> dict | None:
    """'Acme | Senior Engineer, Support Lead | London, UK | ONSITE | https://acme.io' -> fields."""
    text = strip_html(raw_html).strip()
    if not text:
        return None
    first = text.splitlines()[0].strip()
    parts = [p.strip() for p in first.split("|") if p.strip()]
    if len(parts) < 2:
        return None
    company = re.sub(r"\s*\(.*?\)\s*$", "", parts[0]).strip()       # "Acme (YC W21)" -> "Acme"
    if not company or len(company) > 60 or company.lower().startswith(("hiring", "we are", "we're")):
        return None
    urls = re.findall(r"https?://[^\s<>\"')]+", raw_html or "")
    urls = [html.unescape(u).rstrip(".,;") for u in urls]
    domain = ""
    for u in urls:
        d = company_domain(u)
        if d and domain_matches(d, company):
            domain = d
            break
    return {"company": company, "roles": parts[1] if len(parts) > 1 else "", "first_line": first,
            "country": hn_country(first), "domain": domain}


def parse_hn(children: list[dict], thread_title: str, cfg: dict, keys: dict, limit: int) -> list[dict]:
    seen: set = set()
    out = []
    month = re.sub(r"^.*\((.*)\).*$", r"\1", thread_title or "") or "this month"
    for c in children:
        if not c.get("text"):
            continue
        p = parse_hn_post(c["text"])
        if not p or not p["country"]:
            continue
        if _skip(p["company"], p["domain"], cfg, keys, seen):
            continue
        roles = p["roles"][:120]
        out.append({
            "lead_id": lead_id(p["domain"], p["company"]),
            "found_at": _now(),
            "source": "hn_whoishiring",
            "segment": "startup",
            "company": p["company"],
            "domain": p["domain"],
            "website": f"https://{p['domain']}" if p["domain"] else "",
            "country": p["country"],
            "roles_sample": roles,
            "signal": f"Hiring on Hacker News 'Who is hiring?' ({month}): {roles}",
            "job_urls": f"https://news.ycombinator.com/item?id={c.get('id', '')}",
            "status": "new",
            "notes": p["first_line"][:200],
        })
        if len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------- fetch

def fetch_json(url: str, session=None, timeout: int = 60):
    import requests

    s = session or requests
    r = s.get(url, timeout=timeout, headers={"User-Agent": "TevrixBDBot/1.0"})
    r.raise_for_status()
    return r.json()


def collect(cfg: dict, keys: dict, limit: int | None = None, session=None) -> list[dict]:
    s = cfg.get("startups", {})
    cap = min(limit or s.get("max_new_leads_per_run", 10), s.get("max_new_leads_per_run", 10))
    leads: list[dict] = []
    if s.get("yc", True):
        try:
            yc = parse_yc(fetch_json(YC_URL, session), cfg, keys, cap)
            log.info("YC: %d new hiring startups in target countries", len(yc))
            leads += yc
        except Exception as exc:
            log.warning("YC source failed: %s", str(exc)[:200])
    if s.get("hacker_news", True) and len(leads) < cap:
        try:
            hits = fetch_json(HN_SEARCH, session).get("hits", [])
            thread = next((h for h in hits if "who is hiring" in (h.get("title") or "").lower()), None)
            if thread:
                item = fetch_json(HN_ITEM.format(id=thread["objectID"]), session)
                seen_keys = dict(keys, names=set(keys.get("names", set())) | {normalise_company(l["company"]) for l in leads})
                hn = parse_hn(item.get("children", []), thread.get("title", ""), cfg, seen_keys, cap - len(leads))
                log.info("Hacker News: %d new startups in target countries (%s)", len(hn), thread.get("title"))
                leads += hn
        except Exception as exc:
            log.warning("Hacker News source failed: %s", str(exc)[:200])
    return leads[:cap]
