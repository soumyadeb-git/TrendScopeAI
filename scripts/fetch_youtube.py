#!/usr/bin/env python3
"""Discover YouTube search results for recent Google Trends topics using yt-dlp.

This uses no YouTube Data API key. Videos are topic-related YouTube search results,
not a claim about YouTube's official Trending list. YouTube may throttle or change
its site, so last-good snapshots are preserved when a refresh returns no usable data.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REGIONS = {
    "IN": "India", "US": "United States", "GB": "United Kingdom", "CA": "Canada",
    "AU": "Australia", "DE": "Germany", "FR": "France", "JP": "Japan", "BR": "Brazil",
    "SG": "Singapore", "KR": "South Korea", "ES": "Spain", "IT": "Italy",
}
TOPICS_PER_REGION = 3
RESULTS_PER_TOPIC = 3
MAX_VIDEOS_PER_REGION = 9


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_upload_date(value: Any) -> str | None:
    """Convert yt-dlp's YYYYMMDD upload date to a UTC ISO date, if valid."""
    if not isinstance(value, str) or not re.fullmatch(r"\d{8}", value):
        return None
    try:
        parsed = dt.datetime.strptime(value, "%Y%m%d").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None
    return parsed.isoformat(timespec="seconds").replace("+00:00", "Z")


def normalise_video_entry(row: dict[str, Any], topic: str, result_order: int) -> dict[str, Any] | None:
    """Map yt-dlp fields to our frontend schema without fabricating missing metadata."""
    video_id = str(row.get("id") or "").strip()
    title = str(row.get("title") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id) or not title:
        return None

    # Generate a canonical URL instead of trusting an arbitrary extractor-provided URL.
    view_count = row.get("view_count")
    if type(view_count) is not int or view_count < 0:
        view_count = None
    like_count = row.get("like_count")
    if type(like_count) is not int or like_count < 0:
        like_count = None
    duration = row.get("duration")
    if type(duration) is not int or duration < 0:
        duration = None

    thumbnail = row.get("thumbnail")
    if not isinstance(thumbnail, str) or not thumbnail.startswith("https://"):
        thumbnail = None

    return {
        "video_id": video_id,
        "title": title[:400],
        "channel": str(row.get("channel") or row.get("uploader") or "Channel unavailable")[:200],
        "channel_id": str(row.get("channel_id") or "") or None,
        "published_at": parse_upload_date(row.get("upload_date")),
        "duration_seconds": duration,
        "description": str(row.get("description") or "")[:350],
        "thumbnail": thumbnail,
        "view_count": view_count,
        "like_count": like_count,
        "result_order": result_order,
        "matched_topic": topic,
        "url": f"https://www.youtube.com/watch?v={video_id}",
    }


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def read_snapshot(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def make_payload(code: str, items: list[dict[str, Any]], topics: list[str], *, checked_at: str, note: str | None = None) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "source": "YouTube search via yt-dlp, seeded by Google Trends Trending Now RSS",
        "region": code,
        "region_name": REGIONS[code],
        "last_checked_at": checked_at if items else None,
        "last_attempt_at": checked_at,
        "is_live_data": bool(items),
        "items": items,
        "seed_topics": topics,
        "note": note or (
            "Videos were discovered via YouTube search for Google Trends topics. This is not an official "
            "YouTube-wide trending ranking; search result order is not a popularity rank, view counts "
            "are total views rather than view velocity, and some metadata may be unavailable."
        ),
    }


def discover_region(code: str, yt_dlp_module: Any) -> bool:
    trends_path = DATA / f"trends-{code}.json"
    output_path = DATA / f"youtube-{code}.json"
    trends = read_snapshot(trends_path)
    topics = [str(item.get("query") or "").strip() for item in trends.get("items", []) if isinstance(item, dict)]
    # Keep the refresh deliberately small to reduce outbound requests and throttling.
    topics = list(dict.fromkeys(topic for topic in topics if topic))[:TOPICS_PER_REGION]
    now = utc_now()
    previous = read_snapshot(output_path)

    if not topics:
        if previous.get("is_live_data") is True and previous.get("items"):
            print(f"[{code}] No trend topics available; retaining last successful YouTube snapshot.")
            return True
        atomic_json(output_path, make_payload(
            code, [], [], checked_at=now,
            note="No Google Trends topic data is available for this region yet. Run the Google Trends fetch first.",
        ))
        print(f"[{code}] No trend topics yet; wrote an empty, explicitly non-live snapshot.")
        return True

    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": False,
        "ignoreerrors": True,
        "socket_timeout": 15,
        "playlistend": RESULTS_PER_TOPIC,
        "extractor_retries": 1,
        "retries": 1,
        "geo_bypass": False,
        "noplaylist": False,
    }
    collected: list[dict[str, Any]] = []
    seen: set[str] = set()
    failed_searches = 0

    with yt_dlp_module.YoutubeDL(options) as ydl:
        for topic in topics:
            try:
                result = ydl.extract_info(f"ytsearch{RESULTS_PER_TOPIC}:{topic}", download=False)
            except Exception as exc:  # YouTube can throttle automated requests.
                failed_searches += 1
                print(f"[{code}] YouTube search failed for {topic!r}: {exc}", file=sys.stderr)
                continue
            for topic_result_order, row in enumerate((result or {}).get("entries", []) or [], start=1):
                if not isinstance(row, dict):
                    continue
                # This order belongs to the individual query, not a cross-topic popularity rank.
                normalised = normalise_video_entry(row, topic, topic_result_order)
                if normalised is None or normalised["video_id"] in seen:
                    continue
                seen.add(normalised["video_id"])
                collected.append(normalised)
                if len(collected) >= MAX_VIDEOS_PER_REGION:
                    break
            if len(collected) >= MAX_VIDEOS_PER_REGION:
                break

    if not collected and previous.get("is_live_data") is True and previous.get("items"):
        # Do not replace known-good data with an empty result caused by a likely throttle.
        previous["last_attempt_at"] = now
        previous["refresh_note"] = "The latest refresh returned no usable videos; showing the previous successful snapshot."
        atomic_json(output_path, previous)
        print(f"[{code}] No usable results; preserved previous successful snapshot.")
        return failed_searches < len(topics)

    note = None
    if failed_searches:
        note = (
            f"Collected {len(collected)} usable video(s); {failed_searches} topic search(es) failed. "
            "Results are YouTube search discoveries seeded by Google Trends, not an official YouTube-wide trending ranking."
        )
    payload = make_payload(code, collected, topics, checked_at=now, note=note)
    atomic_json(output_path, payload)
    print(f"[{code}] Saved {len(collected)} YouTube video result(s) from {len(topics)} topic search(es).")
    return failed_searches < len(topics)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geo", choices=[*REGIONS, "ALL"], default=os.environ.get("GEO_INPUT", "ALL").upper(), help="Region code or ALL")
    args = parser.parse_args()
    targets = list(REGIONS) if args.geo == "ALL" else [args.geo]

    try:
        import yt_dlp
    except ImportError:
        print("Missing yt-dlp. Install project dependencies with: python -m pip install -r requirements.txt", file=sys.stderr)
        return 2

    successes = 0
    for code in targets:
        try:
            success = discover_region(code, yt_dlp)
        except Exception as exc:  # preserve other regions if one regional run fails unexpectedly
            print(f"[{code}] YouTube discovery failed: {exc}", file=sys.stderr)
            success = False
        successes += int(success)
    print(f"YouTube discovery finished: {successes}/{len(targets)} region(s) had no total search failure.")
    return 0 if successes == len(targets) else 1


if __name__ == "__main__":
    raise SystemExit(main())
