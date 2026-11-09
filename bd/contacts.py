"""Website contact finder: crawl a few pages, extract emails and people, infer the email pattern."""
from __future__ import annotations

import logging
import re
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

from .domains import ascii_fold, normalise_domain

log = logging.getLogger(__name__)

ROLE_LOCALS = {"careers", "jobs", "hr", "talent", "recruitment", "people", "recruiting", "hiring"}
GENERIC_LOCALS = ROLE_LOCALS | {
    "info", "hello", "contact", "enquiries", "enquiry", "admin", "office", "sales", "support", "team",
    "mail", "marketing", "accounts", "billing", "privacy", "noreply", "no-reply", "help", "press",
    "media", "webmaster", "dpo", "gdpr", "legal", "service", "customerservice", "reception", "general",
}
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico", ".css", ".js")

PATTERNS = ["first.last", "firstlast", "flast", "f.last", "first_last", "first", "last", "firstl", "last.first"]

# Lower number = better contact for HireMinds.
TITLE_TIERS = [
    (1, r"head of (people|hr|human resources|talent|recruitment|talent acquisition)|chief people officer|"
        r"\bcpo\b|hr director|director of (people|hr|human resources|talent)|people director|"
        r"talent acquisition (lead|manager|director|partner)|\bta lead\b|head of talent|hr manager|"
        r"people (and|&) culture (manager|lead|director)|recruitment (manager|lead|director)"),
    (2, r"co-?founder|founder|chief executive|\bceo\b|managing director|\bmd\b|owner|managing partner"),
    (3, r"chief operating officer|\bcoo\b|general manager|operations director|director of operations"),
]
TITLE_ANY = re.compile(
    r"\b(head of|chief|directors?|manager|co-?founder|founder|ceo|coo|cfo|cto|cpo|md|partner|lead|"
    r"officer|president|owner|recruit\w*|talent|people|hr|consultant|executive|vp|vice president)\b",
    re.I,
)
NAME_RE = re.compile(r"^[A-Z][a-zA-Z'\-]+(?: [A-Z][a-zA-Z'\-]+){1,2}$")
NOT_NAMES = {
    "our team", "about us", "contact us", "read more", "learn more", "meet the", "the team",
    "privacy policy", "cookie policy", "terms of", "get in", "view all", "find out", "join us",
    "head office", "our people", "sign up", "book a", "case studies", "all rights",
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


# ---------------------------------------------------------------- emails

def deobfuscate(text: str) -> str:
    t = text or ""
    t = re.sub(r"\s*[\[\(\{]\s*at\s*[\]\)\}]\s*", "@", t, flags=re.I)
    t = re.sub(r"\s*[\[\(\{]\s*dot\s*[\]\)\}]\s*", ".", t, flags=re.I)
    t = re.sub(r"(\w)\s+at\s+(\w[\w\-]*)\s+dot\s+(\w)", r"\1@\2.\3", t, flags=re.I)
    return t


def extract_emails(text: str, domain: str = "") -> list[str]:
    """Emails in text (incl. [at]/(at) obfuscation). With a domain, only same-domain addresses."""
    found = []
    for m in EMAIL_RE.findall(deobfuscate(text)):
        e = m.strip(".").lower()
        local, _, host = e.partition("@")
        if host.endswith(IMAGE_EXT) or e.endswith(IMAGE_EXT) or re.search(r"@\d+x\.", e) or "@2x" in e:
            continue
        if domain and normalise_domain(host) != normalise_domain(domain):
            continue
        if e not in found:
            found.append(e)
    return found


def is_role_address(email: str) -> bool:
    return email.split("@")[0].lower() in ROLE_LOCALS


def is_personal_address(email: str) -> bool:
    return email.split("@")[0].lower() not in GENERIC_LOCALS


# ---------------------------------------------------------------- people

def title_rank(title: str) -> int | None:
    t = (title or "").lower()
    for rank, pat in TITLE_TIERS:
        if re.search(pat, t):
            return rank
    return None


def _looks_like_name(s: str) -> bool:
    s = s.strip()
    if not NAME_RE.match(ascii_fold(s)) or len(s) > 40:
        return False
    low = s.lower()
    if any(x in low for x in NOT_NAMES) or TITLE_ANY.search(s):
        return False
    return True


def extract_people(text: str) -> list[tuple[str, str]]:
    """(name, title) pairs: 'Jane Doe, Head of People', 'Jane Doe – CEO', or a name line then a title line."""
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in (text or "").splitlines()]
    lines = [ln for ln in lines if ln]
    people: list[tuple[str, str]] = []
    seen = set()

    def add(name: str, title: str):
        name, title = name.strip(" ,|-–—:"), title.strip(" ,|-–—:")
        if not title or len(title) > 80 or not TITLE_ANY.search(title):
            return
        key = name.lower()
        if key not in seen:
            seen.add(key)
            people.append((name, title))

    for i, ln in enumerate(lines):
        parts = re.split(r"\s*(?:,|\||–|—| - |:)\s*", ln, maxsplit=1)
        if len(parts) == 2 and _looks_like_name(parts[0]):
            add(parts[0], parts[1])
            continue
        if _looks_like_name(ln) and i + 1 < len(lines):
            add(ln, lines[i + 1])
    return people


def split_name(name: str) -> tuple[str, str]:
    parts = [re.sub(r"[^a-z]", "", ascii_fold(p).lower()) for p in name.split()]
    parts = [p for p in parts if p]
    if len(parts) < 2:
        return (parts[0] if parts else ""), ""
    return parts[0], parts[-1]


def build_email(first: str, last: str, pattern: str, domain: str) -> str:
    f, l = split_name(f"{first} {last}") if last else split_name(first)
    if not f or not l:
        return ""
    local = {
        "first": f, "last": l, "first.last": f"{f}.{l}", "firstlast": f"{f}{l}", "flast": f"{f[0]}{l}",
        "f.last": f"{f[0]}.{l}", "first_last": f"{f}_{l}", "firstl": f"{f}{l[0]}", "last.first": f"{l}.{f}",
    }.get(pattern)
    return f"{local}@{domain}" if local else ""


def infer_pattern(emails: list[str], people: list[tuple[str, str]] | list[str]) -> tuple[str, str] | None:
    """Match personal addresses to found names. Returns (pattern, matched_email) or None.

    More specific patterns are tried first so 'first' only wins when nothing else fits.
    """
    names = [p[0] if isinstance(p, (tuple, list)) else p for p in people]
    personal = [e for e in emails if is_personal_address(e)]
    for pattern in PATTERNS[:5] + PATTERNS[7:] + PATTERNS[5:7]:  # 'first'/'last' last
        for name in names:
            f, l = split_name(name)
            if not f or not l:
                continue
            for e in personal:
                local, _, dom = e.partition("@")
                if build_email(f, l, pattern, dom).split("@")[0] == local:
                    return pattern, e
    return None


def pick_contact(people: list[tuple[str, str]], emails: list[str], domain: str, ceo_name: str = "") -> dict:
    """Choose the best person and email; set email_source as the build spec defines."""
    ranked = sorted(
        [(title_rank(t), n, t) for n, t in people if title_rank(t) is not None], key=lambda x: x[0]
    )
    if not ranked and ceo_name:
        ranked = [(2, ceo_name, "CEO")]
    pat = infer_pattern(emails, people)
    pattern = pat[0] if pat else ""
    role = next((e for e in emails if is_role_address(e)), "")
    out = {"contact_name": "", "contact_title": "", "email": "", "email_source": "none", "pattern": pattern,
           "people_found": "; ".join(f"{n} ({t})" for n, t in people[:8]), "role_address": role}
    if ranked:
        _, name, title = ranked[0]
        out["contact_name"], out["contact_title"] = name, title
        f, l = split_name(name)
        published = next((e for e in emails
                          if l and any(build_email(f, l, p, domain).split("@")[0] == e.split("@")[0]
                                       for p in PATTERNS)), "")
        if published:
            out["email"], out["email_source"] = published, "published"
        elif pattern and l:
            out["email"], out["email_source"] = build_email(f, l, pattern, domain), "pattern-confirmed"
        elif l:
            out["email_source"] = "pattern-guess"  # verify.py asks Apify to find the address
        elif role:
            out["email"], out["email_source"] = role, "role-address"
    elif role:
        out["email"], out["email_source"] = role, "role-address"
    return out


# ---------------------------------------------------------------- crawling

class Crawler:
    def __init__(self, cfg: dict, session=None):
        import requests

        c = cfg["contacts"]
        self.ua = c["user_agent"]
        self.timeout = c["timeout_seconds"]
        self.max_pages = c["max_pages"]
        self.keywords = c["page_keywords"]
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = self.ua

    def _robots(self, base: str) -> RobotFileParser:
        rp = RobotFileParser()
        try:
            r = self.session.get(urljoin(base, "/robots.txt"), timeout=self.timeout)
            rp.parse(r.text.splitlines() if r.status_code == 200 else [])
        except Exception:
            rp.parse([])
        return rp

    def _get(self, url: str) -> str:
        try:
            r = self.session.get(url, timeout=self.timeout, allow_redirects=True)
            if r.status_code == 200 and "html" in r.headers.get("content-type", "html"):
                return r.text
        except Exception as exc:
            log.debug("fetch %s failed: %s", url, exc)
        return ""

    def crawl(self, website: str) -> list[tuple[str, str]]:
        """Home page plus up to max_pages-1 about/team/contact/careers pages. Returns (url, html)."""
        from bs4 import BeautifulSoup

        if not website:
            return []
        base = website if website.startswith("http") else f"https://{website}"
        rp = self._robots(base)
        if not rp.can_fetch(self.ua, base):
            log.info("robots.txt disallows %s", base)
            return []
        home = self._get(base)
        if not home:
            return []
        pages = [(base, home)]
        host = normalise_domain(base)
        links = []
        for a in BeautifulSoup(home, "html.parser").find_all("a", href=True):
            href = urljoin(base, a["href"].split("#")[0])
            if normalise_domain(href) != host or urlparse(href).scheme not in {"http", "https"}:
                continue
            text = f"{href} {a.get_text(' ')}".lower()
            if any(k in text for k in self.keywords) and href not in links and href.rstrip("/") != base.rstrip("/"):
                links.append(href)
        for href in links[: self.max_pages - 1]:
            if rp.can_fetch(self.ua, href):
                html = self._get(href)
                if html:
                    pages.append((href, html))
        return pages


def page_text(html: str) -> str:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")
    mailto = " ".join(a["href"][7:].split("?")[0] for a in soup.find_all("a", href=True)
                      if a["href"].lower().startswith("mailto:"))
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()
    return soup.get_text("\n") + "\n" + mailto


def find_contact(lead: dict, crawler: Crawler, extra_emails: list[str] | None = None) -> dict:
    """Crawl the lead's site and return contact fields for the Leads row."""
    domain = lead.get("domain", "")
    texts = [page_text(html) for _, html in crawler.crawl(lead.get("website") or domain)]
    joined = "\n".join(texts)
    emails = extract_emails(joined, domain)
    for e in extra_emails or []:
        e = e.lower()
        if normalise_domain(e.split("@")[-1]) == domain and e not in emails:
            emails.append(e)
    people = []
    for t in texts:
        for p in extract_people(t):
            if p[0].lower() not in {x[0].lower() for x in people}:
                people.append(p)
    out = pick_contact(people, emails, domain, lead.get("ceo_name", ""))
    out["_people"], out["_emails"] = people, emails  # kept for a second pass with OSINT emails
    return out
