from bd.config import load_config
from bd.intake_startups import collect, hn_country, parse_hn, parse_hn_post, parse_yc

CFG = load_config()
NO_KEYS = {"domains": set(), "names": set(), "dnc_emails": set(), "dnc_domains": set()}

YC = [
    {"name": "Duffel", "website": "https://duffel.com/", "team_size": 70, "regions": ["Europe", "United Kingdom"],
     "status": "Active", "isHiring": True, "batch": "Summer 2018", "industry": "Consumer",
     "one_liner": "The complete toolkit to sell travel.", "all_locations": "London, England, United Kingdom",
     "url": "https://www.ycombinator.com/companies/duffel"},
    {"name": "Bigco", "website": "https://bigco.com", "team_size": 900, "regions": ["United Kingdom"],
     "status": "Active", "isHiring": True},                                   # too big
    {"name": "Valley Only", "website": "https://valley.io", "team_size": 12, "regions": ["United States of America"],
     "status": "Active", "isHiring": True},                                   # not a target country
    {"name": "Kiwi AI", "website": "https://kiwi.ai", "team_size": 20, "regions": ["Oceania", "New Zealand"],
     "status": "Active", "isHiring": True, "batch": "Winter 2026"},
    {"name": "Gone Ltd", "website": "https://gone.com", "team_size": 10, "regions": ["United Kingdom"],
     "status": "Inactive", "isHiring": True},                                 # not active
]


def test_parse_yc_filters_and_maps_country():
    leads = parse_yc(YC, CFG, NO_KEYS, limit=10)
    assert [(l["company"], l["country"]) for l in leads] == [("Duffel", "UK"), ("Kiwi AI", "New Zealand")]
    d = leads[0]
    assert d["segment"] == "startup" and d["source"] == "yc" and d["domain"] == "duffel.com"
    assert d["signal"] == "YC Summer 2018 startup, hiring now, team of 70"
    assert "toolkit" in d["notes"]
    # Already in Leads by domain -> skipped
    assert [l["company"] for l in parse_yc(YC, CFG, dict(NO_KEYS, domains={"duffel.com"}), 10)] == ["Kiwi AI"]
    assert len(parse_yc(YC, CFG, NO_KEYS, limit=1)) == 1


POSTS = [
    {"id": 1, "text": "Acme (YC W21) | Customer Success Lead, Support Engineers | London, UK | ONSITE | "
                      "<a href=\"https://www.acme.io/careers\">https://www.acme.io/careers</a><p>We build things."},
    {"id": 2, "text": "Bravo | Senior Engineer | REMOTE (US only) | https://bravo.dev"},
    {"id": 3, "text": "Charlie Health | Nurses, Care Coordinators | Sydney, Australia | https://charliehealth.com.au"},
    {"id": 4, "text": "Hiring!<p>We are a stealth startup in Berlin"},
    {"id": 5, "text": ""},
    {"id": 6, "text": "Delta | Backend Engineer | Dublin or REMOTE (EU) | https://jobs.lever.co/delta"},
]


def test_parse_hn_post_and_country():
    p = parse_hn_post(POSTS[0]["text"])
    assert p["company"] == "Acme" and p["country"] == "UK" and p["domain"] == "acme.io"
    assert p["roles"].startswith("Customer Success Lead")
    assert hn_country("Bravo | Engineer | REMOTE (US only)") == ""
    assert hn_country("Delta | Engineer | Dublin or REMOTE (EU)") == "Ireland"
    assert parse_hn_post(POSTS[3]["text"]) is None
    assert parse_hn_post("") is None
    # A job-board link is never taken as the company's own site.
    assert parse_hn_post(POSTS[5]["text"])["domain"] == ""


def test_parse_hn_builds_leads():
    leads = parse_hn(POSTS, "Ask HN: Who is hiring? (November 2026)", CFG, NO_KEYS, limit=10)
    assert [(l["company"], l["country"]) for l in leads] == [("Acme", "UK"), ("Charlie Health", "Australia"), ("Delta", "Ireland")]
    assert leads[0]["signal"].startswith("Hiring on Hacker News 'Who is hiring?' (November 2026): Customer Success Lead")
    assert leads[0]["job_urls"] == "https://news.ycombinator.com/item?id=1"
    assert all(l["segment"] == "startup" and l["status"] == "new" for l in leads)


class _Resp:
    def __init__(self, data):
        self._d = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._d


class _Session:
    def get(self, url, timeout=None, headers=None):
        if "yc-oss" in url:
            return _Resp(YC)
        if "search_by_date" in url:
            return _Resp({"hits": [{"title": "Ask HN: Who wants to be hired? (November 2026)", "objectID": "9"},
                                   {"title": "Ask HN: Who is hiring? (November 2026)", "objectID": "8"}]})
        if url.endswith("/items/8"):
            return _Resp({"children": POSTS})
        raise AssertionError(url)


def test_collect_combines_sources_and_caps():
    leads = collect(CFG, NO_KEYS, limit=4, session=_Session())
    assert [l["source"] for l in leads] == ["yc", "yc", "hn_whoishiring", "hn_whoishiring"]
    assert len({l["company"] for l in leads}) == 4


def test_india_startups():
    yc = [{"name": "GroMo", "website": "https://gromo.in", "team_size": 100, "regions": ["South Asia", "India"],
           "status": "Active", "isHiring": True, "batch": "Winter 2022"}]
    assert [(l["company"], l["country"]) for l in parse_yc(yc, CFG, NO_KEYS, 5)] == [("GroMo", "India")]
    assert hn_country("Acme | Ops Lead | Bengaluru, India | ONSITE") == "India"
    assert hn_country("Acme | Engineer | Gurugram") == "India"
