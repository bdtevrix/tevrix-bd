"""CLI.

  python -m bd.main jobs [--dry-run] [--limit N] [--searches N] [--no-contacts]
  python -m bd.main maps results.csv [--dry-run] [--limit N] [--no-contacts]
  python -m bd.main maps-queries [--out queries.txt]
  python -m bd.main check-sheet

--dry-run never writes to the Sheet. Every run writes its leads to out/<kind>-<date>.csv.
"""
from __future__ import annotations

import argparse
import csv
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

from .config import headers, load_config
from .osint import Osint

log = logging.getLogger("bd")

STRONG_SOURCES = ("published", "pattern-confirmed")


def add_osint(lead: dict, osint) -> None:
    """Second pass for a weak contact: add ColdReach and theHarvester emails, then re-pick the contact.

    The source of any address taken from them is written to notes (DPDP: keep source and date).
    """
    from .contacts import pick_contact

    found = osint.find(lead["domain"], lead.get("contact_name", ""))
    crawled = list(lead.get("_emails") or [])
    extra = {e: tool for tool, emails in found.items() for e in emails if e not in crawled}
    if not extra:
        return
    picked = pick_contact(lead.get("_people") or [], crawled + list(extra), lead["domain"], lead.get("ceo_name", ""))
    if picked["email_source"] == "none" and lead.get("email_source") != "none":
        return  # nothing better than what the crawl gave
    lead.update(picked)
    tools = sorted({extra[e] for e in extra})
    note = f"extra emails via {', '.join(tools)}: {len(extra)}"
    if lead.get("email") in extra:
        note += f"; chosen email from {extra[lead['email']]}"
    lead["notes"] = "; ".join(x for x in (lead.get("notes", ""), note) if x)


def _keys(dry_run: bool):
    """Existing Leads / Do-not-contact keys, or empty sets in a dry run without credentials."""
    from . import sheets

    if dry_run and not os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"):
        log.info("dry run without Sheet credentials: skipping dedupe")
        return None, {"domains": set(), "names": set(), "dnc_emails": set(), "dnc_domains": set()}
    sh = sheets.open_sheet()
    return sh, sheets.existing_keys(sh)


def enrich(leads: list[dict], cfg: dict, keys: dict, find_contacts: bool = True) -> list[dict]:
    """Contact finding, verification and Do-not-contact filtering."""
    from .contacts import Crawler, find_contact
    from .verify import verify_leads

    if find_contacts:
        crawler = Crawler(cfg)
        osint = Osint(cfg)
        for i, lead in enumerate(leads, 1):
            if not lead.get("domain"):
                lead["email_source"] = "none"
                continue
            try:
                lead.update(find_contact(lead, crawler, lead.get("_emails")))
                if lead.get("email_source") not in STRONG_SOURCES and osint.can_run():
                    add_osint(lead, osint)
            except Exception as exc:
                log.warning("contact finder failed for %s: %s", lead.get("domain"), exc)
                lead["email_source"] = "none"
            log.info("[%d/%d] %s -> %s %s", i, len(leads), lead["domain"], lead.get("email_source"),
                     lead.get("contact_title", ""))
    token = os.environ.get("APIFY_TOKEN") or None
    verify_leads(leads, token, cfg["verify"]["apify_actor"], cfg["verify"]["batch_size"])
    out = []
    for lead in leads:
        email = (lead.get("email") or "").lower()
        if email and email in keys["dnc_emails"]:
            lead["email"], lead["email_status"] = "", ""
            lead["notes"] = (lead.get("notes", "") + "; contact on Do not contact").strip("; ")
        out.append(lead)
    return out


def write_csv(leads: list[dict], kind: str) -> Path:
    Path("out").mkdir(exist_ok=True)
    path = Path("out") / f"{kind}-{datetime.now():%Y%m%d-%H%M}.csv"
    cols = headers()["Leads"]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(leads)
    return path


def summary(leads: list[dict]) -> str:
    from collections import Counter

    st = Counter(l.get("email_status") or "none" for l in leads)
    seg = Counter(l.get("segment", "") for l in leads)
    return f"{len(leads)} leads | segments {dict(seg)} | email_status {dict(st)}"


def save(sh, leads: list[dict], dry_run: bool) -> None:
    from . import sheets

    if dry_run:
        for l in leads[:15]:
            print(f"  {l['lead_id']} {l['company'][:30]:30} {l.get('country',''):10} "
                  f"{l.get('email_source',''):17} {l.get('email_status',''):6} {l.get('signal','')[:60]}")
        print("dry run: nothing written to the Sheet")
        return
    n = sheets.append(sh.worksheet("Leads"), leads)
    log.info("appended %d rows to Leads", n)


def cmd_jobs(args, cfg):
    from .intake_jobs import aggregate, filter_candidates, scrape

    sh, keys = _keys(args.dry_run)
    df = scrape(cfg, limit_searches=args.searches)
    log.info("JobSpy returned %d job rows", len(df))
    companies = aggregate(df, cfg)
    leads = filter_candidates(companies, cfg, keys["domains"], keys["names"], keys["dnc_domains"], args.limit)
    log.info("%d companies -> %d new lead candidates", len(companies), len(leads))
    leads = enrich(leads, cfg, keys, not args.no_contacts)
    print(summary(leads), "| csv:", write_csv(leads, "jobs"))
    save(sh, leads, args.dry_run)


def cmd_maps(args, cfg):
    from .intake_maps import parse_csv

    sh, keys = _keys(args.dry_run)
    leads = parse_csv(args.csv, cfg, keys["domains"], keys["names"], keys["dnc_domains"], args.limit)
    log.info("%d new agency candidates", len(leads))
    leads = enrich(leads, cfg, keys, not args.no_contacts)
    print(summary(leads), "| csv:", write_csv(leads, "agencies"))
    save(sh, leads, args.dry_run)


def cmd_maps_queries(args, cfg):
    from .intake_maps import queries

    text = "\n".join(queries(cfg)) + "\n"
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)


def cmd_check_sheet(args, cfg):
    from . import sheets

    problems = sheets.check_headers(sheets.open_sheet())
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print("Sheet headers match schema/headers.json")


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(prog="bd")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("jobs", "maps"):
        sp = sub.add_parser(name)
        if name == "maps":
            sp.add_argument("csv")
        sp.add_argument("--dry-run", action="store_true")
        sp.add_argument("--limit", type=int, default=None, help="max new leads")
        sp.add_argument("--no-contacts", action="store_true", help="skip the website contact finder")
        if name == "jobs":
            sp.add_argument("--searches", type=int, default=None, help="max JobSpy calls (testing)")
    sq = sub.add_parser("maps-queries")
    sq.add_argument("--out")
    sub.add_parser("check-sheet")
    args = p.parse_args(argv)
    cfg = load_config()
    {"jobs": cmd_jobs, "maps": cmd_maps, "maps-queries": cmd_maps_queries,
     "check-sheet": cmd_check_sheet}[args.cmd](args, cfg)


if __name__ == "__main__":
    main()
