"""Extra email sources for one company domain: ColdReach (MIT) and theHarvester.

Both run as external CLIs installed by the workflow. They only *find* addresses; verification stays
in verify.py (MX + Apify). ColdReach always runs with --no-reacher, so nothing needs outbound port 25.
If a tool is not installed, it is skipped quietly.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from .contacts import extract_emails
from .domains import normalise_domain

log = logging.getLogger(__name__)


# ---------------------------------------------------------------- parsers (pure, tested)

def parse_coldreach(text: str, domain: str) -> list[dict]:
    """`coldreach find --json` output -> [{email, confidence, sources}] for this domain only."""
    try:
        data = json.loads(text or "{}")
    except json.JSONDecodeError:
        return []
    out = []
    for row in data.get("emails", []) if isinstance(data, dict) else []:
        email = str(row.get("email", "")).strip().lower()
        if not email or normalise_domain(email.split("@")[-1]) != normalise_domain(domain):
            continue
        if row.get("status") in ("invalid", "disposable"):
            continue
        out.append({"email": email, "confidence": row.get("confidence", 0),
                    "sources": str(row.get("sources", ""))})
    return out


def parse_harvester(text: str, domain: str) -> list[str]:
    """theHarvester output: JSONL findings ({"type": "email", "value": ...}) or the legacy JSON report."""
    found: list[str] = []
    text = text or ""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    for ln in lines:
        try:
            obj = json.loads(ln)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and "email" in str(obj.get("type", "")).lower():
            found.append(str(obj.get("value", "")))
    if not found:  # legacy .json report: {"emails": [...], ...}
        try:
            obj = json.loads(text)
            if isinstance(obj, dict):
                found = [str(e) for e in obj.get("emails", [])]
        except json.JSONDecodeError:
            pass
    # Clean up through the same extractor the crawler uses (same-domain, no image names, no escapes).
    cleaned = []
    for e in found:
        e = e.lower().removeprefix("u003c").strip("<>\"' ")
        for x in extract_emails(e, domain):
            if x not in cleaned:
                cleaned.append(x)
    return cleaned


# ---------------------------------------------------------------- runners

class Osint:
    """Runs the external finders within a total time budget for the whole intake run."""

    def __init__(self, cfg: dict):
        o = cfg.get("osint", {})
        self.enabled = o.get("enabled", True)
        self.cr_cmd = o.get("coldreach_cmd", ["coldreach"])
        self.cr_timeout = o.get("coldreach_timeout", 60)
        self.th_cmd = o.get("harvester_cmd", ["theHarvester"])
        self.th_sources = o.get("harvester_sources", "duckduckgo,yahoo,mojeek,commoncrawl,urlscan,otx")
        self.th_timeout = o.get("harvester_timeout", 120)
        self.max_domains = o.get("max_domains_per_run", 25)
        self.deadline = time.monotonic() + o.get("budget_minutes", 20) * 60
        self.used = 0
        self.have_cr = self._available(self.cr_cmd)
        self.have_th = self._available(self.th_cmd)
        if self.enabled:
            log.info("osint: coldreach %s, theHarvester %s",
                     "on" if self.have_cr else "not installed", "on" if self.have_th else "not installed")

    @staticmethod
    def _available(cmd: list[str]) -> bool:
        return bool(cmd) and shutil.which(cmd[0]) is not None

    def can_run(self) -> bool:
        return (self.enabled and (self.have_cr or self.have_th) and self.used < self.max_domains
                and time.monotonic() < self.deadline)

    def coldreach(self, domain: str, name: str = "") -> list[dict]:
        if not self.have_cr:
            return []
        cmd = list(self.cr_cmd) + ["find", "--domain", domain, "--quick", "--no-reacher", "--no-reddit",
                                   "--json", "--timeout", "10"]
        if name:
            cmd += ["--name", name]
        out = _run(cmd, self.cr_timeout)
        return parse_coldreach(out, domain)

    def harvester(self, domain: str) -> list[str]:
        if not self.have_th:
            return []
        with tempfile.TemporaryDirectory() as tmp:
            base = os.path.join(tmp, "th")
            _run(list(self.th_cmd) + ["-d", domain, "-b", self.th_sources, "-f", base], self.th_timeout)
            text = ""
            for ext in (".jsonl", ".json"):
                p = Path(base + ext)
                if p.exists():
                    text = p.read_text(encoding="utf-8", errors="ignore")
                    if text.strip():
                        break
        return parse_harvester(text, domain)

    def find(self, domain: str, name: str = "") -> dict[str, list[str]]:
        """{'coldreach': [...], 'theharvester': [...]} for one domain; counts toward the run budget."""
        self.used += 1
        res = {"coldreach": [r["email"] for r in self.coldreach(domain, name)], "theharvester": []}
        if time.monotonic() < self.deadline:
            res["theharvester"] = self.harvester(domain)
        return res


SECRET_VARS = ("GOOGLE_SERVICE_ACCOUNT_JSON", "SHEET_ID", "APIFY_TOKEN", "GITHUB_TOKEN", "ACTIONS_RUNTIME_TOKEN",
               "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_URL", "GOOGLE_APPLICATION_CREDENTIALS",
               "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE", "GOOGLE_GHA_CREDS_PATH")


def clean_env() -> dict:
    """Third-party tools never see our secrets."""
    return {k: v for k, v in os.environ.items() if k not in SECRET_VARS}


def _run(cmd: list[str], timeout: int) -> str:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=clean_env())
        if p.returncode not in (0, 1):  # coldreach exits 1 when nothing passes
            log.debug("%s exit %s: %s", cmd[0], p.returncode, p.stderr[-300:])
        return p.stdout
    except subprocess.TimeoutExpired:
        log.info("%s timed out after %ss", cmd[0], timeout)
    except Exception as exc:
        log.info("%s failed: %s", cmd[0], exc)
    return ""
