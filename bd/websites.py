"""Find a company's own website when the job board did not give one.

Searches the web for the company name and keeps the first result whose domain plausibly
belongs to that company (its name words appear in the domain). Job boards, ATS hosts and
social sites are never accepted. Unsure means blank: a wrong website is worse than none.
"""
from __future__ import annotations

import logging
import random
import re
import time

from .domains import ascii_fold, company_domain, normalise_company

log = logging.getLogger(__name__)

# Extra hosts that often top a company-name search but are never the company's own site.
NOT_COMPANY = {
    "wikipedia.org", "bloomberg.com", "crunchbase.com", "zoominfo.com", "dnb.com", "endole.co.uk",
    "companieshouse.gov.uk", "find-and-update.company-information.service.gov.uk", "opencorporates.com",
    "gov.uk", "service.gov.uk", "rocketreach.co", "apollo.io", "lusha.com", "signalhire.com", "craft.co",
    "comparably.com", "kununu.com", "ambitionbox.com", "theorg.com", "owler.com", "cbinsights.com",
    "pitchbook.com", "tracxn.com", "yellowpages.com", "yell.com", "facebook.com", "linkedin.com",
    "instagram.com", "x.com", "twitter.com", "youtube.com", "indeed.com", "glassdoor.com",
    "glassdoor.co.uk", "trustpilot.com", "reddit.com", "medium.com", "ft.com", "reuters.com",
}

STOPWORDS = {"and", "of", "the", "group", "services", "service", "solutions", "uk", "ltd", "limited",
             "company", "international", "global", "holdings", "support", "homes"}


def name_tokens(company: str) -> list[str]:
    words = [w for w in normalise_company(company).split() if len(w) > 2]
    strong = [w for w in words if w not in STOPWORDS]
    return strong or words


def domain_matches(domain: str, company: str) -> bool:
    """True when the domain's first label contains the company's distinctive word(s).

    'northwind.co.uk' matches 'Northwind Retail Ltd'; 'iquw.com' matches 'IQUW Group';
    'jobs-guide.com' does not match 'Purpose Group'.
    """
    label = re.sub(r"[^a-z0-9]", "", domain.split(".")[0].lower())
    toks = name_tokens(company)
    if not label or not toks:
        return False
    if toks[0] in label:
        return True
    # Acronym: 'Hyland Support Services' -> 'hss'
    words = normalise_company(company).split()
    acronym = "".join(w[0] for w in words if w)
    return len(acronym) >= 3 and label.startswith(acronym)


def pick_website(results: list[dict], company: str) -> str:
    """First result URL that is the company's own site, as a registrable domain, or ''."""
    for r in results:
        url = r.get("href") or r.get("url") or r.get("link") or ""
        d = company_domain(url)
        if not d or d in NOT_COMPANY or any(d.endswith("." + x) or d == x for x in NOT_COMPANY):
            continue
        if domain_matches(d, company):
            return d
    return ""


class WebsiteFinder:
    def __init__(self, cfg: dict, search=None):
        w = cfg.get("websites", {})
        self.enabled = w.get("enabled", True)
        self.max_lookups = w.get("max_lookups_per_run", 60)
        self.pause = w.get("pause_seconds", [1.5, 3.0])
        self.used = 0
        self._search = search

    def _results(self, query: str) -> list[dict]:
        if self._search:
            return self._search(query)
        from ddgs import DDGS

        return DDGS().text(query, max_results=8) or []

    def find(self, company: str, country: str = "") -> str:
        if not self.enabled or self.used >= self.max_lookups or not company:
            return ""
        self.used += 1
        query = f"{ascii_fold(company)} {country} official website".strip()
        try:
            domain = pick_website(self._results(query), company)
        except Exception as exc:  # search blocked or rate-limited: carry on without it
            log.info("website search failed for %r: %s", company, str(exc)[:150])
            domain = ""
        if not self._search:
            time.sleep(random.uniform(*self.pause))
        return domain
