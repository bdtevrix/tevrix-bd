"""Company-name and domain normalisation."""
from __future__ import annotations

import hashlib
import re
import unicodedata

import tldextract

# Use the snapshot bundled with tldextract: no network call at runtime.
_EXTRACT = tldextract.TLDExtract(suffix_list_urls=())

# Job boards, ATS hosts, social sites and big platforms: never a company's own site.
BLOCKED_DOMAINS = {
    "indeed.com", "linkedin.com", "glassdoor.com", "glassdoor.co.uk", "bayt.com", "ziprecruiter.com",
    "monster.com", "reed.co.uk", "totaljobs.com", "cv-library.co.uk", "jobs.ie", "irishjobs.ie",
    "seek.com.au", "seek.co.nz", "jobsdb.com", "jobstreet.com", "mycareersfuture.gov.sg", "gulftalent.com",
    "naukrigulf.com", "naukri.com", "trademe.co.nz", "jora.com", "adzuna.co.uk", "adzuna.com.au",
    "myworkdayjobs.com", "workday.com", "greenhouse.io", "lever.co", "smartrecruiters.com", "ashbyhq.com",
    "workable.com", "bamboohr.com", "jobvite.com", "icims.com", "taleo.net", "oraclecloud.com",
    "successfactors.com", "successfactors.eu", "recruitee.com", "teamtailor.com", "personio.de",
    "personio.com", "breezy.hr", "jazzhr.com", "applytojob.com", "pinpointhq.com", "rippling-ats.com",
    "dayforcehcm.com", "ukg.com", "paylocity.com", "hibob.com", "join.com", "careers-page.com",
    "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "tiktok.com",
    "google.com", "goo.gl", "bit.ly", "wix.com", "wixsite.com", "squarespace.com", "wordpress.com",
    "linktr.ee", "about.me", "yell.com", "yelp.com", "trustpilot.com",
    # India: job boards, directories and free site builders
    "foundit.in", "monsterindia.com", "shine.com", "timesjobs.com", "apna.co", "workindia.in", "internshala.com",
    "instahyre.com", "hirist.tech", "iimjobs.com", "cutshort.io", "wellfound.com", "justdial.com", "indiamart.com",
    "sulekha.com", "ambitionbox.com", "business.site", "blogspot.com", "godaddysites.com", "webnode.page",
    "zohorecruit.com", "zohorecruit.in", "keka.com", "darwinbox.in", "freshteam.com",
}

_LEGAL_SUFFIXES = {
    "ltd", "limited", "llc", "l.l.c", "inc", "incorporated", "plc", "pty", "pte", "fze", "fzco", "fzllc",
    "fz", "dmcc", "gmbh", "bv", "nv", "sa", "sarl", "co", "corp", "corporation", "company", "uk", "group",
    "holdings", "the", "lp", "llp", "nz", "au", "sg", "ie", "uae", "pvt", "private", "opc", "india",
}


def ascii_fold(text: str) -> str:
    """'Zoë Müller' -> 'Zoe Muller'."""
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")


def normalise_company(name: str) -> str:
    """Lower-case, ASCII, no punctuation, no legal suffixes: 'Acme Ltd.' and 'ACME Limited' match."""
    s = ascii_fold(name).lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    words = [w for w in s.split() if w not in _LEGAL_SUFFIXES]
    if not words:  # e.g. a company literally called "The Group"
        words = s.split()
    return " ".join(words)


def normalise_domain(url_or_domain: str) -> str:
    """Return the registrable domain ('https://www.jobs.acme.co.uk/x' -> 'acme.co.uk'), or ''."""
    raw = (url_or_domain or "").strip().lower()
    if not raw or raw in {"nan", "none", "null"}:
        return ""
    raw = re.sub(r"^mailto:", "", raw)
    if "@" in raw and "/" not in raw:
        raw = raw.split("@", 1)[1]
    ext = _EXTRACT(raw)
    if not ext.domain or not ext.suffix:
        return ""
    return f"{ext.domain}.{ext.suffix}"


def is_blocked_domain(domain: str) -> bool:
    d = normalise_domain(domain)
    return not d or d in BLOCKED_DOMAINS


def company_domain(url: str) -> str:
    """Domain of a company website URL, or '' if it is a job board, ATS or social link."""
    d = normalise_domain(url)
    return "" if is_blocked_domain(d) else d


def website_url(url: str) -> str:
    """A clean https home page URL for a domain or URL."""
    d = company_domain(url)
    return f"https://{d}" if d else ""


def lead_id(domain: str = "", company: str = "") -> str:
    """'L-' + 8 hex chars of a hash of the domain (or normalised company name)."""
    key = normalise_domain(domain) or normalise_company(company)
    return "L-" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:8]
