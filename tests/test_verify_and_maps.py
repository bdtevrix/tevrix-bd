import csv

from bd.config import load_config
from bd.intake_maps import parse_csv, queries
from bd.verify import verify_leads

CFG = load_config()


def _mx(domain):
    return {"good.com": "safe", "nomx.com": "bad"}.get(domain, "risky")


def test_verify_rules_with_token():
    leads = [
        {"domain": "good.com", "email": "jane.doe@good.com", "email_source": "published"},
        {"domain": "nomx.com", "email": "a.b@nomx.com", "email_source": "pattern-confirmed"},
        {"domain": "good.com", "email": "jobs@good.com", "email_source": "role-address"},
        {"domain": "good.com", "contact_name": "Raj Patel", "email": "", "email_source": "pattern-guess"},
        {"domain": "catch.com", "contact_name": "Ann Lee", "email": "", "email_source": "pattern-guess"},
        {"domain": "good.com", "contact_name": "No Body", "email": "", "email_source": "pattern-guess",
         "role_address": "careers@good.com"},
        {"domain": "good.com", "contact_name": "Lost Person", "email": "", "email_source": "pattern-guess"},
    ]
    calls = []

    def finder(persons):
        calls.append(persons)
        return [
            {"email": "rpatel@good.com", "status": "found", "pattern": "flast",
             "_input": persons[0]},
            {"email": "ann.lee@catch.com", "status": "catch-all", "_input": persons[1]},
            {"status": "not-found", "_input": persons[2]},
            {"status": "no-mx", "_input": persons[3]},
        ]

    verify_leads(leads, "tok", "pnda~email-finder", mx=_mx, finder=finder)
    assert [l["email_status"] for l in leads] == ["safe", "bad", "safe", "safe", "risky", "safe", "bad"]
    assert leads[3]["email"] == "rpatel@good.com" and leads[3]["pattern"] == "flast"
    assert leads[5]["email"] == "careers@good.com" and leads[5]["email_source"] == "role-address"
    assert leads[6]["email"] == ""
    assert len(calls) == 1 and calls[0][0] == {"firstName": "raj", "lastName": "patel", "domain": "good.com"}


def test_verify_without_token_is_risky():
    leads = [{"domain": "good.com", "email": "jane.doe@good.com", "email_source": "published"},
             {"domain": "good.com", "contact_name": "Raj Patel", "email": "", "email_source": "pattern-guess"}]
    verify_leads(leads, None, "x", mx=_mx, finder=lambda p: 1 / 0)
    assert [l["email_status"] for l in leads] == ["risky", "risky"]


def test_maps_queries():
    q = queries(CFG)
    assert "recruitment agency in London" in q and "staffing agency in Auckland" in q
    # India cities use their own categories (placement consultancies, Gulf recruiters).
    assert "placement consultancy in Mumbai" in q and "overseas recruitment agency in Kochi" in q
    assert "recruitment agency in Mumbai" not in q
    assert len(q) == len(set(q)) == 44


def test_parse_gosom_csv_india_and_country_cap(tmp_path):
    p = tmp_path / "results.csv"
    rows = [{"title": f"Shree Placement {i} Pvt Ltd", "website": f"https://shree{i}.in", "review_count": str(100 - i),
             "timezone": "Asia/Kolkata"} for i in range(30)]
    rows.append({"title": "Harbour Recruitment", "website": "https://harbourrec.co.nz", "review_count": "1",
                 "timezone": "Pacific/Auckland"})
    with open(p, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["title", "website", "review_count", "timezone"])
        w.writeheader()
        w.writerows(rows)
    leads = parse_csv(str(p), CFG)
    india = [l for l in leads if l["country"] == "India"]
    assert len(india) == CFG["maps"]["max_per_country"] == 25          # capped, leaves room for others
    assert leads[-1]["company"] == "Harbour Recruitment"               # still reached
    assert india[0]["domain"] == "shree0.in" and india[0]["segment"] == "agency"


def test_parse_gosom_csv(tmp_path):
    p = tmp_path / "results.csv"
    rows = [
        {"title": "Harbour Recruitment", "website": "https://www.harbourrec.co.nz/", "phone": "+64 9 123",
         "emails": "[\"info@harbourrec.co.nz\"]", "category": "Employment agency", "review_count": "42",
         "timezone": "Pacific/Auckland", "address": "1 Queen St, Auckland"},
        {"title": "Harbour Recruitment", "website": "https://harbourrec.co.nz", "review_count": "3",
         "timezone": "Pacific/Auckland"},  # duplicate
        {"title": "Dubai Staffing FZE", "website": "", "review_count": "",
         "address": "Business Bay, Dubai, United Arab Emirates"},
        {"title": "Known Agency", "website": "https://known.com", "review_count": "100"},
    ]
    with open(p, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["title", "website", "phone", "emails", "category", "review_count",
                                           "timezone", "address"])
        w.writeheader()
        w.writerows(rows)
    leads = parse_csv(str(p), CFG, existing_domains={"known.com"})
    assert [l["company"] for l in leads] == ["Harbour Recruitment", "Dubai Staffing FZE"]
    h = leads[0]
    assert h["segment"] == "agency" and h["source"] == "google_maps" and h["country"] == "New Zealand"
    assert h["domain"] == "harbourrec.co.nz" and h["_emails"] == ["info@harbourrec.co.nz"]
    assert leads[1]["country"] == "UAE"
