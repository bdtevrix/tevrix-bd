from bd.domains import (ascii_fold, company_domain, is_blocked_domain, lead_id, normalise_company,
                        normalise_domain, website_url)


def test_normalise_company_strips_suffixes_and_punctuation():
    assert normalise_company("Acme Ltd.") == "acme"
    assert normalise_company("ACME Limited") == "acme"
    assert normalise_company("Smith & Jones Pty Ltd") == "smith and jones"
    assert normalise_company("Zoë's Café FZ-LLC") == "zoe s cafe"
    assert normalise_company("The Group") == "the group"  # nothing left: keep the words


def test_normalise_domain():
    assert normalise_domain("https://www.jobs.acme.co.uk/careers?x=1") == "acme.co.uk"
    assert normalise_domain("Acme.com") == "acme.com"
    assert normalise_domain("jane@acme.com.au") == "acme.com.au"
    assert normalise_domain("mailto:hr@acme.ie") == "acme.ie"
    assert normalise_domain("nan") == ""
    assert normalise_domain("not a domain") == ""


def test_job_boards_and_ats_are_blocked():
    assert is_blocked_domain("https://uk.indeed.com/cmp/acme")
    assert is_blocked_domain("acme.wd3.myworkdayjobs.com")
    assert is_blocked_domain("boards.greenhouse.io/acme")
    assert company_domain("https://jobs.lever.co/acme") == ""
    assert company_domain("https://acme.io") == "acme.io"
    assert website_url("www.acme.io/about") == "https://acme.io"


def test_lead_id_stable_and_prefers_domain():
    a = lead_id("https://www.acme.com", "Acme Ltd")
    assert a == lead_id("acme.com", "Something else")
    assert a.startswith("L-") and len(a) == 10
    assert lead_id("", "Acme Ltd") == lead_id("", "ACME Limited")


def test_ascii_fold():
    assert ascii_fold("Siobhán Ní Bhriain") == "Siobhan Ni Bhriain"
