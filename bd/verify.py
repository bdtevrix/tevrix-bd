"""Email verification: MX check for published/confirmed/role addresses, Apify for guesses."""
from __future__ import annotations

import logging
from functools import lru_cache

from .contacts import split_name

log = logging.getLogger(__name__)

APIFY_URL = "https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items"


@lru_cache(maxsize=4096)
def has_mx(domain: str) -> bool | None:
    """True / False, or None when DNS could not answer (treated as risky)."""
    import dns.exception
    import dns.resolver

    try:
        answers = dns.resolver.resolve(domain, "MX", lifetime=8)
        return any(str(r.exchange).strip(".") for r in answers)
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        return False
    except dns.exception.DNSException:
        return None


def apify_find(persons: list[dict], token: str, actor: str, batch_size: int = 10, session=None) -> list[dict]:
    """Ask the Apify actor to find/verify addresses. persons: [{firstName,lastName,domain}].

    Sends batches of `batch_size` (the free plan covers the first 10 persons of each run).
    """
    import requests

    s = session or requests
    rows: list[dict] = []
    for i in range(0, len(persons), batch_size):
        batch = persons[i:i + batch_size]
        try:
            r = s.post(
                APIFY_URL.format(actor=actor),
                headers={"Authorization": f"Bearer {token}"},
                json={"persons": batch},
                timeout=280,
            )
            r.raise_for_status()
            data = r.json()
            for j, row in enumerate(data if isinstance(data, list) else []):
                row = dict(row)
                row.setdefault("_input", batch[j] if j < len(batch) else {})
                rows.append(row)
        except Exception as exc:
            log.warning("Apify batch %d failed: %s", i // batch_size, str(exc)[:200])
    return rows


def _key(first: str, last: str, domain: str) -> tuple[str, str, str]:
    return first.lower(), last.lower(), domain.lower()


def _match_rows(rows: list[dict]) -> dict:
    """Index Apify rows by (first, last, domain), from the row itself or the batch input."""
    out = {}
    for row in rows:
        src = row.get("input") or row.get("_input") or {}
        first = row.get("firstName") or src.get("firstName", "")
        last = row.get("lastName") or src.get("lastName", "")
        domain = row.get("domain") or src.get("domain", "")
        if first and domain:
            out[_key(first, last, domain)] = row
    return out


def status_for_mx(domain: str) -> str:
    mx = has_mx(domain)
    return "safe" if mx else ("bad" if mx is False else "risky")


def verify_leads(leads: list[dict], token: str | None, actor: str, batch_size: int = 10,
                 mx=None, finder=None) -> list[dict]:
    """Set email / email_status on each lead per the build-spec rules. Mutates and returns leads.

    mx and finder are injectable for tests.
    """
    mx_status = mx or status_for_mx
    finder = finder or (lambda persons: apify_find(persons, token, actor, batch_size))

    guesses = []
    for lead in leads:
        src = lead.get("email_source", "none")
        dom = lead.get("domain", "")
        if src in ("published", "pattern-confirmed", "role-address") and lead.get("email"):
            lead["email_status"] = mx_status(dom)
        elif src == "pattern-guess" and dom:
            if not token:
                lead["email_status"] = "risky"
                continue
            first, last = split_name(lead.get("contact_name", ""))
            if first and last:
                guesses.append((lead, {"firstName": first, "lastName": last, "domain": dom}))
            else:
                lead["email_status"] = "bad"
        else:
            lead["email_status"] = lead.get("email_status") or ""

    if guesses:
        found = _match_rows(finder([p for _, p in guesses]))
        for lead, p in guesses:
            row = found.get(_key(p["firstName"], p["lastName"], p["domain"]))
            st = (row or {}).get("status", "unknown")
            if st == "found" and row.get("email"):
                lead["email"], lead["email_status"] = row["email"].lower(), "safe"
                if row.get("pattern"):
                    lead["pattern"] = row["pattern"]
            elif st == "catch-all":
                lead["email"] = row.get("email") or lead.get("email", "")
                lead["email_status"] = "risky"
            else:
                lead["email_status"] = "bad"
            # A failed guess falls back to the role address if one was published.
            if lead["email_status"] == "bad" and lead.get("role_address"):
                lead["email"], lead["email_source"] = lead["role_address"], "role-address"
                lead["email_status"] = mx_status(p["domain"])
            elif lead["email_status"] == "bad":
                lead["email"] = ""
    # The spec: any address with no APIFY_TOKEN is at most risky.
    if not token:
        for lead in leads:
            if lead.get("email") and lead.get("email_status") == "safe":
                lead["email_status"] = "risky"
    return leads
