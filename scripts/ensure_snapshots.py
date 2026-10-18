#!/usr/bin/env python3
"""Create valid empty JSON bootstrap snapshots when files are missing.

This deliberately creates no example topics. Only the fetchers can set
is_live_data=true after obtaining current results from their sources.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REGIONS = {
    "IN": "India", "US": "United States", "GB": "United Kingdom",
    "CA": "Canada", "AU": "Australia", "DE": "Germany",
    "FR": "France", "JP": "Japan", "BR": "Brazil", "SG": "Singapore",
    "KR": "South Korea", "ES": "Spain", "IT": "Italy",
}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def trend_bootstrap(geo: str) -> dict[str, Any]:
    return {
        "schema_version": 3,
        "geo": geo,
        "country": REGIONS[geo],
        "source": "Google Trends Trending Now RSS",
        "source_url": f"https://trends.google.com/trending?geo={geo}",
        "rss_url": f"https://trends.google.com/trending/rss?geo={geo}",
        "snapshot_at": None,
        "last_checked_at": None,
        "previous_snapshot_at": None,
        "refresh_interval_minutes": 10,
        "is_live_data": False,
        "demo": True,
        "data_limitations": [
            "No successful live fetch has completed for this region yet.",
            "Google RSS reports approximate traffic buckets, not exact search counts.",
            "Feed order is not a Google ranking by search volume or relevance.",
            "Per-item timestamps are supplied by RSS and are not verified trend start times.",
            "Category labels and opportunity scores are locally inferred, not official Google metrics.",
        ],
        "items": [],
        "comparison_available": False,
    }


def youtube_bootstrap(geo: str) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "source": "YouTube search via the open-source yt-dlp library",
        "region": geo,
        "region_name": REGIONS[geo],
        "last_checked_at": None,
        "last_attempt_at": None,
        "is_live_data": False,
        "items": [],
        "seed_topics": [],
        "note": (
            "No successful live discovery has completed for this region. Results, when available, "
            "are YouTube search discoveries seeded by Google Trends topics, not an official "
            "YouTube-wide trending ranking. Search order is not a popularity rank."
        ),
    }


def ensure_snapshots() -> list[Path]:
    created: list[Path] = []
    for geo in REGIONS:
        for filename, payload in (
            (f"trends-{geo}.json", trend_bootstrap(geo)),
            (f"youtube-{geo}.json", youtube_bootstrap(geo)),
        ):
            path = DATA / filename
            valid = False
            if path.exists():
                try:
                    current = json.loads(path.read_text(encoding="utf-8"))
                    valid = (
                        isinstance(current, dict)
                        and isinstance(current.get("items"), list)
                        and isinstance(current.get("is_live_data"), bool)
                    )
                except (OSError, json.JSONDecodeError):
                    valid = False
            if not valid:
                atomic_json(path, payload)
                created.append(path)
                print(f"Created/repaired empty bootstrap: {path.relative_to(ROOT)}")
    return created


if __name__ == "__main__":
    created = ensure_snapshots()
    print(f"Bootstrap check complete; created {len(created)} missing file(s).")
