"""Agency intake: parse the gosom/google-maps-scraper CSV into agency leads."""
from __future__ import annotations

import ast
import csv
import json
import re
from datetime import datetime, timezone

from .domains import company_domain, lead_id, normalise_company, website_url
from .intake_jobs import is_excluded

TZ_TO_COUNTRY = {
    "Europe/London": "UK", "Europe/Dublin": "Ireland", "Asia/Dubai": "UAE", "Asia/Singapore": "Singapore",
    "Australia/Sydney": "Australia", "Australia/Melbourne": "Australia", "Australia/Brisbane": "Australia",
    "Australia/Perth": "Australia", "Australia/Adelaide": "Australia", "Pacific/Auckland": "New Zealand",
}


def queries(cfg: dict) -> list[str]:
    """One query per category x city, e.g. 'recruitment agency in London'."""
    m = cfg["maps"]
    return [f"{cat} in {c['city']}" for c in m["cities"] for cat in m["categories"]]


def _emails(value: str) -> list[str]:
    v = (value or "").strip()
    if not v:
        return []
    for parser in (json.loads, ast.literal_eval):
        try:
            got = parser(v)
            if isinstance(got, (list, tuple)):
                return [str(x).strip().lower() for x in got if "@" in str(x)]
        except Exception:
            pass
    return [e.lower() for e in re.findall(r"[\w.%+\-]+@[\w.\-]+\.[a-z]{2,}", v, flags=re.I)]


def _country(row: dict, cfg: dict) -> str:
    tz = (row.get("timezone") or "").strip()
    if tz in TZ_TO_COUNTRY:
        return TZ_TO_COUNTRY[tz]
    hay = " ".join(str(row.get(k, "")) for k in ("address", "complete_address", "input_id")).lower()
    for c in cfg["maps"]["cities"]:
        if c["city"].lower() in hay:
            return c["country"]
    for name in ("United Kingdom", "Ireland", "United Arab Emirates", "Singapore", "Australia", "New Zealand"):
        if name.lower() in hay:
            return {"United Kingdom": "UK", "United Arab Emirates": "UAE"}.get(name, name)
    return ""


def parse_csv(path: str, cfg: dict, existing_domains=frozenset(), existing_names=frozenset(),
              dnc_domains=frozenset(), limit: int | None = None) -> list[dict]:
    """Return Leads-shaped dicts (segment agency) plus a private '_emails' list from Maps."""
    cap = min(limit or cfg["maps"]["max_new_leads_per_run"], cfg["maps"]["max_new_leads_per_run"])
    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")
    exclude = cfg["filters"].get("exclude", [])
    seen_domains, seen_names, out = set(), set(), []
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    # Most-reviewed first: a rough proxy for an established agency.
    rows.sort(key=lambda r: int(float(r.get("review_count") or 0)), reverse=True)
    for row in rows:
        title = (row.get("title") or "").strip()
        if not title:
            continue
        domain = company_domain(row.get("website", ""))
        key = normalise_company(title)
        if is_excluded(title, domain, exclude):
            continue
        if (domain and (domain in existing_domains or domain in dnc_domains or domain in seen_domains)) \
                or key in existing_names or key in seen_names:
            continue
        seen_names.add(key)
        if domain:
            seen_domains.add(domain)
        reviews = row.get("review_count") or ""
        notes = [f"category: {row.get('category', '')}"]
        if row.get("phone"):
            notes.append(f"phone: {row['phone']}")
        if reviews:
            notes.append(f"reviews: {reviews}")
        out.append({
            "lead_id": lead_id(domain, title),
            "found_at": now,
            "source": "google_maps",
            "segment": "agency",
            "company": title,
            "domain": domain,
            "website": website_url(row.get("website", "")),
            "country": _country(row, cfg),
            "signal": f"Recruitment / staffing agency on Google Maps ({reviews or 0} reviews)",
            "status": "new",
            "notes": "; ".join(n for n in notes if n.split(": ", 1)[-1]),
            "_emails": _emails(row.get("emails", "")),
        })
        if len(out) >= cap:
            break
    return out
