import pandas as pd

from bd.config import load_config
from bd.intake_jobs import (aggregate, classify_segment, filter_candidates, parse_size, signal_text, size_ok,
                            terms_for)

CFG = load_config()


def test_parse_size():
    assert parse_size("11 to 50") == (11, 50)
    assert parse_size("201-500 employees") == (201, 500)
    assert parse_size("1,001 to 5,000") == (1001, 5000)
    assert parse_size("10,000+") == (10000, 10**9)
    assert parse_size("Less than 10") == (0, 10)
    assert parse_size("") is None
    assert parse_size("unknown") is None


def test_size_ok():
    assert size_ok("51 to 200", 20, 500)
    assert size_ok("11 to 50", 20, 500)        # overlaps
    assert not size_ok("1,001 to 5,000", 20, 500)
    assert not size_ok("2 to 10", 20, 500)
    assert size_ok("", 20, 500)                # unknown = keep


def test_classify_segment():
    from bd.intake_jobs import segment_for

    kw = CFG["agency_keywords"]
    assert classify_segment("Hays Recruitment Ltd", kw) == "agency"
    assert classify_segment("Blue Talent Partners", kw) == "agency"
    assert classify_segment("Recruit Expert Pte. Ltd.", kw) == "agency"
    assert classify_segment("Northwind Retail", kw) == "smb"
    assert segment_for("Morgan McKinley", "Human Resources And Staffing", kw) == "agency"
    assert segment_for("Northwind Retail", "Retail", kw) == "smb"


def test_volume_roles():
    from bd.intake_jobs import count_volume_roles

    kw = CFG["filters"]["volume_keywords"]
    assert count_volume_roles(["Sales Executive", "Barista", "Care Assistant (Nights)"], kw) == 3
    assert count_volume_roles(["Technical Recruiter", "Staff Engineer", "Applied AI Architect"], kw) == 0
    assert count_volume_roles(["Customer Success Manager"], kw) == 1


def _df():
    rows = []
    # 4 sales roles at Northwind (one duplicate posting seen twice), size 51-200, website direct.
    for i, t in enumerate(["Sales Executive", "Sales Executive", "Account Manager", "Customer Service Advisor"]):
        rows.append({"site": "indeed", "title": t, "company": "Northwind Ltd", "job_url": f"https://uk.indeed.com/j/{i}",
                     "company_num_employees": "51 to 200", "company_url_direct": "https://www.northwind.co.uk",
                     "company_industry": "Retail", "country_code": "UK"})
    rows.append({"site": "linkedin", "title": "Sales Executive", "company": "NORTHWIND LIMITED",
                 "job_url": "https://uk.indeed.com/j/0", "country_code": "UK"})  # duplicate URL
    # Hiring a recruiter plus two warehouse roles at a company with no website: kept (recruiter + volume).
    for i, t in enumerate(["Talent Acquisition Partner", "Warehouse Operative", "Warehouse Operative - Nights"]):
        rows.append({"site": "linkedin", "title": t, "company": "Kiwi Logistics",
                     "job_url": f"https://linkedin.com/jobs/{i}", "company_num_employees": None, "country_code": "NZ"})
    # Big-tech style: one recruiter and two engineers, no volume roles: dropped.
    for i, t in enumerate(["Technical Recruiter", "Software Engineer", "Staff Engineer"]):
        rows.append({"site": "linkedin", "title": t, "company": "Cloudly Inc",
                     "job_url": f"https://linkedin.com/jobs/c{i}", "country_code": "UK"})
    # A staffing agency (by industry) with two roles: kept as an agency.
    for i, t in enumerate(["Recruitment Consultant", "Resourcer"]):
        rows.append({"site": "indeed", "title": t, "company": "Morgan & Co", "job_url": f"https://ag/{i}",
                     "company_industry": "Human Resources And Staffing", "country_code": "IE"})
    # Two ordinary roles: dropped (under 3, no high intent).
    for i in range(2):
        rows.append({"site": "indeed", "title": "Account Manager", "company": "Small Co", "job_url": f"https://x/{i}",
                     "country_code": "SG"})
    # Too big.
    for i in range(5):
        rows.append({"site": "indeed", "title": "Sales Executive", "company": "Megacorp", "job_url": f"https://m/{i}",
                     "company_num_employees": "10,000+", "country_code": "AU"})
    # Excluded by config.
    for i in range(3):
        rows.append({"site": "indeed", "title": "Recruiter", "company": "Amazon UK Services", "job_url": f"https://a/{i}",
                     "country_code": "UK"})
    return pd.DataFrame(rows)


def test_aggregate_groups_and_dedupes():
    companies = {c["key"]: c for c in aggregate(_df(), CFG)}
    nw = companies["northwind"]
    assert nw["open_roles"] == 4                     # duplicate URL counted once
    assert nw["domain"] == "northwind.co.uk"
    assert nw["size"] == "51 to 200"
    assert nw["country_code"] == "UK"
    assert set(nw["boards"]) == {"indeed", "linkedin"}
    assert companies["kiwi logistics"]["high_intent_titles"] == ["Talent Acquisition Partner"]
    assert companies["kiwi logistics"]["open_roles"] == 3


def test_filter_candidates_rules_and_dedupe():
    companies = aggregate(_df(), CFG)
    leads = filter_candidates(companies, CFG)
    names = [l["company"] for l in leads]
    assert names == ["Northwind Ltd", "Kiwi Logistics", "Morgan & Co"]
    assert "Cloudly Inc" not in names                      # recruiter + engineers only
    assert leads[2]["segment"] == "agency"
    nw = leads[0]
    assert nw["status"] == "new" and nw["segment"] == "smb" and nw["country"] == "UK"
    assert nw["signal"].startswith("4 open roles in 7 days (Sales Executive, Account Manager, Customer Service Advisor)")
    assert leads[1]["country"] == "New Zealand"
    assert "hiring a recruiter" in leads[1]["signal"]
    # Existing domain / name in Leads removes them.
    assert [l["company"] for l in filter_candidates(companies, CFG, existing_domains={"northwind.co.uk"},
                             existing_names={"kiwi logistics"})] == ["Morgan & Co"]
    # Do not contact @domain removes the company too.
    assert [l["company"] for l in filter_candidates(companies, CFG, dnc_domains={"northwind.co.uk"})] == ["Kiwi Logistics", "Morgan & Co"]
    assert len(filter_candidates(companies, CFG, limit=1)) == 1


def test_signal_text_truncates_sample():
    rec = {"titles": ["A", "B", "C", "D"], "open_roles": 4, "high_intent_titles": []}
    assert signal_text(rec) == "4 open roles in 7 days (A, B, C…)"


def test_aggregate_handles_missing_columns():
    df = pd.DataFrame([{"company_name": "Alt Cols Ltd", "job_title": "Recruiter", "url": "u1"}])
    out = aggregate(df, CFG)
    assert out[0]["company"] == "Alt Cols Ltd" and out[0]["open_roles"] == 1
    assert aggregate(pd.DataFrame(), CFG) == []


def test_india_terms_and_default_terms():
    india = terms_for(CFG, "IN")
    assert "telecaller" in india and "walk-in interview" in india and "recruiter" in india
    assert "care assistant" not in india                       # UK wording stays out of India searches
    assert "care assistant" in terms_for(CFG, "UK")


def _company(name, n, cc, title="Telecaller", size=None):
    return [{"site": "naukri", "title": title, "company": name, "job_url": f"https://n/{name}/{i}",
             "company_num_employees": size, "country_code": cc} for i in range(n)]


def test_per_country_cap_and_india_size_override():
    rows = []
    for i in range(30):
        rows += _company(f"Bharat Voice {i}", 5, "IN")
    for i in range(3):
        rows += _company(f"Northwind {i}", 3, "UK", "Sales Executive")
    rows += _company("Large BPO", 4, "IN", "Customer Support Executive", "1001 to 5000")   # kept in India
    rows += _company("Large UK Co", 4, "UK", "Sales Executive", "1001 to 5000")            # too big for the UK
    leads = filter_candidates(aggregate(pd.DataFrame(rows), CFG), CFG)
    countries = [l["country"] for l in leads]
    assert countries.count("India") == 20                      # country_overrides.IN.max_leads
    assert countries.count("UK") == 3                          # still reached despite India's volume
    assert "Large UK Co" not in [l["company"] for l in leads]
    big = filter_candidates(aggregate(pd.DataFrame(_company("Large BPO", 4, "IN", "Customer Support Executive",
                                                            "1001 to 5000")), CFG), CFG)
    assert [l["company"] for l in big] == ["Large BPO"]


def test_walk_in_signal_and_india_exclusions():
    rec = {"titles": ["Walk-in Drive for Voice Process", "Telecaller"], "open_roles": 2, "high_intent_titles": []}
    assert signal_text(rec).endswith("; running walk-in interview drives")
    rows = _company("Teleperformance Global Services", 6, "IN") + _company("Shree Manpower Consultants", 2, "IN",
                                                                           "Recruiter")
    leads = filter_candidates(aggregate(pd.DataFrame(rows), CFG), CFG)
    assert [(l["company"], l["segment"]) for l in leads] == [("Shree Manpower Consultants", "agency")]
