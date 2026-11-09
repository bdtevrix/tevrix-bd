import json

from bd.main import add_osint
from bd.osint import clean_env, parse_coldreach, parse_harvester


def test_parse_coldreach_keeps_same_domain_and_drops_invalid():
    out = json.dumps({"domain": "acme.com", "total": 4, "emails": [
        {"email": "Jane.Doe@acme.com", "confidence": 70, "status": "unknown", "sources": "github_commit"},
        {"email": "bob@acme.com", "confidence": 20, "status": "invalid", "sources": "web"},
        {"email": "x@gmail.com", "confidence": 50, "status": "unknown", "sources": "web"},
        {"email": "careers@mail.acme.com", "confidence": 40, "status": "risky", "sources": "whois"},
    ]})
    got = parse_coldreach(out, "acme.com")
    assert [g["email"] for g in got] == ["jane.doe@acme.com", "careers@mail.acme.com"]
    assert parse_coldreach("not json", "acme.com") == []


def test_parse_harvester_jsonl_and_legacy():
    jsonl = "\n".join([
        json.dumps({"run_id": "1", "target": "acme.com", "counts": {}}),
        json.dumps({"type": "email", "value": "u003cjane.doe@acme.com", "sources": ["duckduckgo"]}),
        json.dumps({"type": "hostname", "value": "mail.acme.com", "sources": ["crtsh"]}),
        json.dumps({"type": "email", "value": "someone@other.org", "sources": ["yahoo"]}),
    ])
    assert parse_harvester(jsonl, "acme.com") == ["jane.doe@acme.com"]
    legacy = json.dumps({"emails": ["Tom.Brennan@acme.com", "logo@2x.png"], "hosts": []})
    assert parse_harvester(legacy, "acme.com") == ["tom.brennan@acme.com"]
    assert parse_harvester("", "acme.com") == []


def test_secrets_never_reach_third_party_tools(monkeypatch):
    monkeypatch.setenv("GOOGLE_SERVICE_ACCOUNT_JSON", "{secret}")
    monkeypatch.setenv("APIFY_TOKEN", "tok")
    env = clean_env()
    assert "GOOGLE_SERVICE_ACCOUNT_JSON" not in env and "APIFY_TOKEN" not in env and "PATH" in env


class _FakeOsint:
    def __init__(self, found):
        self.found, self.calls = found, []

    def find(self, domain, name=""):
        self.calls.append((domain, name))
        return self.found


def test_add_osint_turns_a_guess_into_pattern_confirmed():
    lead = {"domain": "acme.com", "contact_name": "Jane Doe", "contact_title": "Head of People",
            "email": "", "email_source": "pattern-guess", "notes": "industry: Retail",
            "_people": [("Jane Doe", "Head of People"), ("Tom Brennan", "CEO")], "_emails": ["info@acme.com"]}
    fake = _FakeOsint({"coldreach": ["tom.brennan@acme.com"], "theharvester": []})
    add_osint(lead, fake)
    assert fake.calls == [("acme.com", "Jane Doe")]
    assert (lead["email"], lead["email_source"], lead["pattern"]) == ("jane.doe@acme.com", "pattern-confirmed", "first.last")
    assert "extra emails via coldreach: 1" in lead["notes"]


def test_add_osint_records_source_of_chosen_email():
    lead = {"domain": "acme.com", "email": "", "email_source": "none", "notes": "",
            "_people": [], "_emails": []}
    add_osint(lead, _FakeOsint({"coldreach": [], "theharvester": ["careers@acme.com"]}))
    assert (lead["email"], lead["email_source"]) == ("careers@acme.com", "role-address")
    assert "chosen email from theharvester" in lead["notes"]


def test_add_osint_nothing_new_changes_nothing():
    lead = {"domain": "acme.com", "email": "jobs@acme.com", "email_source": "role-address", "notes": "",
            "_people": [], "_emails": ["jobs@acme.com"]}
    add_osint(lead, _FakeOsint({"coldreach": ["jobs@acme.com"], "theharvester": []}))
    assert lead["email_source"] == "role-address" and lead["notes"] == ""


def test_website_matching_and_blocklists():
    from bd.websites import WebsiteFinder, domain_matches, pick_website

    assert domain_matches("northwind.co.uk", "Northwind Retail Ltd")
    assert domain_matches("iquw.com", "IQUW Group")
    assert domain_matches("hss-uk.com", "Hyland Support Services")          # acronym
    assert not domain_matches("jobs-guide.com", "Purpose Group")
    results = [
        {"href": "https://uk.indeed.com/cmp/Purpose-Group"},
        {"href": "https://www.linkedin.com/company/purpose-group"},
        {"href": "https://find-and-update.company-information.service.gov.uk/company/123"},
        {"href": "https://www.purposegroup.co.uk/about"},
    ]
    assert pick_website(results, "Purpose Group") == "purposegroup.co.uk"
    assert pick_website(results[:3], "Purpose Group") == ""
    f = WebsiteFinder({"websites": {"max_lookups_per_run": 1}}, search=lambda q: results)
    assert f.find("Purpose Group", "UK") == "purposegroup.co.uk"
    assert f.find("Another Co", "UK") == ""          # cap reached
    boom = WebsiteFinder({}, search=lambda q: 1 / 0)
    assert boom.find("Acme", "UK") == ""             # search errors never stop the run


def test_public_sector_excluded():
    from bd.config import load_config
    from bd.intake_jobs import is_excluded

    ex = load_config()["filters"]["exclude"]
    assert is_excluded("Regulator of Social Housing", "", ex)
    assert is_excluded("Kent County Council", "", ex)
    assert not is_excluded("Purpose Group", "purposegroup.co.uk", ex)
