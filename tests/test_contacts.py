from bd.contacts import (build_email, extract_emails, extract_people, infer_pattern, page_text, pick_contact,
                         title_rank)

HTML = """
<html><body>
<h1>Meet the team</h1>
<div class="person"><h3>Siobhán Kelly</h3><p>Head of People</p></div>
<div class="person"><h3>Tom Brennan</h3><p>Co-founder &amp; CEO</p></div>
<p>Mark O'Neill, Chief Operating Officer</p>
<p>Write to tom.brennan@acme.ie or careers [at] acme [dot] ie</p>
<a href="mailto:hello@acme.ie?subject=hi">Email us</a>
<img src="logo@2x.png"> <p>partner@other.com</p>
<script>var x = "fake@acme.ie";</script>
</body></html>
"""


def test_extract_emails_obfuscation_same_domain_and_images():
    text = page_text(HTML)
    emails = extract_emails(text, "acme.ie")
    assert "tom.brennan@acme.ie" in emails
    assert "careers@acme.ie" in emails
    assert "hello@acme.ie" in emails
    assert "partner@other.com" not in emails       # other domain
    assert "fake@acme.ie" not in emails            # inside <script>
    assert not any("2x" in e for e in emails)
    assert extract_emails("logo@2x.png icon@3x.jpg jane (at) acme.com") == ["jane@acme.com"]


def test_extract_people_line_pairs_and_same_line():
    people = dict(extract_people(page_text(HTML)))
    assert people["Siobhán Kelly"] == "Head of People"
    assert people["Tom Brennan"].startswith("Co-founder")
    assert people["Mark O'Neill"] == "Chief Operating Officer"
    assert "Meet the team" not in people


def test_title_rank_priority():
    assert title_rank("Head of People") == 1
    assert title_rank("Talent Acquisition Lead") == 1
    assert title_rank("Co-founder & CEO") == 2
    assert title_rank("Managing Director") == 2
    assert title_rank("General Manager") == 3
    assert title_rank("Marketing Executive") is None


def test_build_email_patterns_and_ascii_fold():
    d = "acme.com"
    assert build_email("Siobhán", "Kelly", "first.last", d) == "siobhan.kelly@acme.com"
    assert build_email("Jane", "Doe", "flast", d) == "jdoe@acme.com"
    assert build_email("Jane", "Doe", "f.last", d) == "j.doe@acme.com"
    assert build_email("Jane", "Doe", "firstl", d) == "janed@acme.com"
    assert build_email("Jane", "Doe", "last.first", d) == "doe.jane@acme.com"
    assert build_email("Jane", "Doe", "first_last", d) == "jane_doe@acme.com"
    assert build_email("Jane", "", "first.last", d) == ""


def test_infer_pattern_from_colleague():
    people = [("Tom Brennan", "CEO"), ("Siobhán Kelly", "Head of People")]
    assert infer_pattern(["tom.brennan@acme.ie", "careers@acme.ie"], people) == ("first.last", "tom.brennan@acme.ie")
    assert infer_pattern(["tbrennan@acme.ie"], people)[0] == "flast"
    assert infer_pattern(["tom@acme.ie"], people)[0] == "first"
    assert infer_pattern(["info@acme.ie"], people) is None


def test_pick_contact_pattern_confirmed():
    text = page_text(HTML)
    c = pick_contact(extract_people(text), extract_emails(text, "acme.ie"), "acme.ie")
    assert c["contact_name"] == "Siobhán Kelly"
    assert c["email"] == "siobhan.kelly@acme.ie"
    assert c["email_source"] == "pattern-confirmed"
    assert c["role_address"] == "careers@acme.ie"


def test_pick_contact_published_guess_role_none():
    people = [("Jane Doe", "HR Director")]
    assert pick_contact(people, ["jane.doe@x.com"], "x.com")["email_source"] == "published"
    g = pick_contact(people, ["info@x.com"], "x.com")
    assert g["email_source"] == "pattern-guess" and g["email"] == ""
    r = pick_contact([], ["jobs@x.com", "info@x.com"], "x.com")
    assert (r["email"], r["email_source"]) == ("jobs@x.com", "role-address")
    assert pick_contact([], ["info@x.com"], "x.com")["email_source"] == "none"
    # CEO name from the job board is used when the site lists nobody.
    assert pick_contact([], [], "x.com", ceo_name="Raj Patel")["contact_name"] == "Raj Patel"


class _Resp:
    def __init__(self, text, status=200):
        self.text, self.status_code, self.headers = text, status, {"content-type": "text/html"}


class _FakeSession:
    headers = {}
    pages = {
        "https://acme.ie/robots.txt": "User-agent: *\nDisallow: /private",
        "https://acme.ie": '<a href="/about-us">About</a><a href="/team">Our team</a><a href="/private/team">x</a>'
                           '<a href="https://other.com/team">ext</a><a href="/shop">Shop</a>',
        "https://acme.ie/about-us": "<p>We place great people.</p>",
        "https://acme.ie/team": "<h3>Tom Brennan</h3><p>Founder</p><p>tom@acme.ie</p>",
    }

    def __init__(self):
        self.calls = []

    def get(self, url, timeout=None, allow_redirects=True):
        self.calls.append(url)
        return _Resp(self.pages[url]) if url in self.pages else _Resp("", 404)


def test_crawler_respects_robots_and_stays_on_site():
    from bd.config import load_config
    from bd.contacts import Crawler, find_contact

    s = _FakeSession()
    c = find_contact({"domain": "acme.ie", "website": "https://acme.ie"}, Crawler(load_config(), session=s))
    assert "https://acme.ie/private/team" not in s.calls      # robots.txt
    assert not any("other.com" in u for u in s.calls)         # other domains
    assert "https://acme.ie/shop" not in s.calls              # not an about/team/contact page
    assert (c["contact_name"], c["email"], c["email_source"]) == ("Tom Brennan", "tom@acme.ie", "published")
