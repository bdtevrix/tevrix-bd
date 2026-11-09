"""Column names must match across the Sheet schema, the Python writer and the Apps Script."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from bd.config import headers, load_config
from bd.intake_jobs import aggregate, filter_candidates

ROOT = Path(__file__).resolve().parent.parent
GS = ROOT / "apps-script" / "Code.gs"


def _node(code: str) -> str:
    return subprocess.run(["node", "-e", code], capture_output=True, text=True, check=True).stdout


needs_node = pytest.mark.skipif(not shutil.which("node"), reason="node not installed")


@needs_node
def test_apps_script_parses():
    # Apps Script is plain JS; node --check needs a .js extension.
    tmp = ROOT / "out" / "Code.check.js"
    tmp.parent.mkdir(exist_ok=True)
    tmp.write_text(GS.read_text(encoding="utf-8"), encoding="utf-8")
    subprocess.run(["node", "--check", str(tmp)], check=True)


@needs_node
def test_apps_script_headers_match_schema():
    got = json.loads(_node(f"console.log(JSON.stringify(require({json.dumps(str(GS))}).HEADERS))"))
    assert got == headers()


def test_python_leads_fields_exist_in_schema():
    import pandas as pd

    df = pd.DataFrame([{"company": "Acme", "title": t, "job_url": f"u{i}", "country_code": "UK"}
                       for i, t in enumerate(["Sales Executive", "Customer Service Advisor", "Barista"])])
    lead = filter_candidates(aggregate(df, load_config()), load_config())[0]
    lead.update({"contact_name": "", "contact_title": "", "email": "", "email_source": "", "email_status": "",
                 "pattern": "", "people_found": ""})
    assert set(lead) <= set(headers()["Leads"])


def test_every_column_the_script_uses_exists():
    src = GS.read_text(encoding="utf-8")
    used = set(re.findall(r"t\.(?:get|set)\(\w+, '([a-z_0-9]+)'", src)) | set(re.findall(r"t\.col\('([a-z_0-9]+)'\)", src))
    known = set(headers()["Outreach"]) | set(headers()["Do not contact"]) | set(headers()["Log"])
    assert used and used <= known, used - known


def test_prompts_only_mention_real_columns():
    """Claude's prompts write to the Sheet by header name; catch typos."""
    allc = {c for cols in headers().values() for c in cols}
    for p in (ROOT / "claude").glob("*_prompt.md"):
        cols = set(re.findall(r"`([a-z]+_[a-z_0-9]+)`", p.read_text(encoding="utf-8")))
        settings = {c for c in cols if c.isupper()}
        values = {"hn_whoishiring", "recruiter_hire", "walk_in", "plant_hiring", "founder_list",
                  "news_scan"}   # cell values (sources, angles), not columns
        assert cols - settings - values <= allc, (p.name, cols - allc - values)


@needs_node
def test_apps_script_helpers():
    js = f"""
    const g = require({json.dumps(str(GS))});
    const out = {{
      strip: g.stripQuoted_("Yes, keen to chat.\\n\\nOn Mon, 9 Nov 2026 at 10:00, Raj <raj@x.com> wrote:\\n> old"),
      ooo: g.OOO_RE.test("Automatic reply: I am out of the office until Monday"),
      unsub1: g.UNSUB_RE.test("no thanks"),
      unsub2: g.UNSUB_RE.test("Stop emailing me"),
      unsub3: g.UNSUB_RE.test("We stopped hiring for that role but tell me more"),
      addr: g.addr_("Jane Doe <Jane@Acme.com>"),
      dnc: g.isDnc_("a@sub.acme.com", {{emails: {{}}, domains: {{"acme.com": true}}}}),
      tz: g.COUNTRY_TZ["new zealand"],
    }};
    console.log(JSON.stringify(out));
    """
    out = json.loads(_node(js))
    assert out == {"strip": "Yes, keen to chat.", "ooo": True, "unsub1": True, "unsub2": True, "unsub3": False,
                   "addr": "jane@acme.com", "dnc": True, "tz": "Pacific/Auckland"}
