"""Google Sheets access via a service account. Columns are always looked up by header name."""
from __future__ import annotations

import json
import logging
import os

from .config import headers
from .domains import normalise_company, normalise_domain

log = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def open_sheet(sheet_id: str | None = None):
    import gspread
    from google.oauth2.service_account import Credentials

    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON is not set")
    info = json.loads(raw) if raw.lstrip().startswith("{") else json.load(open(raw, encoding="utf-8"))
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    sid = sheet_id or os.environ.get("SHEET_ID", "")
    if not sid:
        raise RuntimeError("SHEET_ID is not set")
    return gspread.authorize(creds).open_by_key(sid)


def records(ws) -> list[dict]:
    """All rows of a worksheet as dicts keyed by the header row."""
    values = ws.get_all_values()
    if not values:
        return []
    head = [h.strip() for h in values[0]]
    return [dict(zip(head, row + [""] * (len(head) - len(row)))) for row in values[1:] if any(row)]


def row_for(header: list[str], data: dict) -> list:
    """Map a dict onto the sheet's header order. Unknown keys are ignored; missing ones are blank."""
    out = []
    for h in header:
        v = data.get(h, "")
        out.append("" if v is None else (v if isinstance(v, (int, float)) else str(v)))
    return out


def append(ws, rows: list[dict]) -> int:
    if not rows:
        return 0
    header = [h.strip() for h in ws.row_values(1)]
    missing = [k for k in rows[0] if not k.startswith("_") and k not in header and k != "role_address"]
    if missing:
        log.warning("columns not in %s header, skipped: %s", ws.title, missing)
    # RAW: nothing scraped is ever evaluated as a formula.
    ws.append_rows([row_for(header, r) for r in rows], value_input_option="RAW",
                   insert_data_option="INSERT_ROWS")
    return len(rows)


def existing_keys(sh) -> dict:
    """Domains and normalised names already in Leads, plus Do-not-contact emails and @domains."""
    leads = records(sh.worksheet("Leads"))
    dnc = records(sh.worksheet("Do not contact"))
    dnc_emails, dnc_domains = set(), set()
    for r in dnc:
        v = (r.get("value") or "").strip().lower()
        if v.startswith("@"):
            dnc_domains.add(normalise_domain(v[1:]) or v[1:])
        elif "@" in v:
            dnc_emails.add(v)
    return {
        "domains": {normalise_domain(r.get("domain", "")) for r in leads if r.get("domain")},
        "names": {normalise_company(r.get("company", "")) for r in leads if r.get("company")},
        "dnc_emails": dnc_emails,
        "dnc_domains": dnc_domains,
    }


def check_headers(sh) -> list[str]:
    """Compare live headers with schema/headers.json. Returns a list of problems (empty = OK)."""
    problems = []
    for tab, expected in headers().items():
        try:
            live = [h.strip() for h in sh.worksheet(tab).row_values(1)]
        except Exception as exc:
            problems.append(f"{tab}: cannot open ({exc})")
            continue
        miss = [h for h in expected if h not in live]
        if miss:
            problems.append(f"{tab}: missing {miss}")
    return problems
