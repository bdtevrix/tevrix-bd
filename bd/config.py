"""Load config/search.yaml and schema/headers.json once."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


@lru_cache(maxsize=1)
def load_config(path: str | None = None) -> dict:
    p = Path(path) if path else ROOT / "config" / "search.yaml"
    with open(p, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@lru_cache(maxsize=1)
def headers() -> dict[str, list[str]]:
    with open(ROOT / "schema" / "headers.json", encoding="utf-8") as fh:
        return json.load(fh)
