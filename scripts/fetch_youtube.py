#!/usr/bin/env python3
"""Discover YouTube videos for currently trending Google Trends topics using yt-dlp.

No YouTube Data API key is used. Results are YouTube search results seeded by real
Google Trends RSS topics, not an official YouTube-wide trending ranking.
"""
from __future__ import annotations
import datetime as dt
import json
import os
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
REGIONS = {
    "IN": "India", "US": "United States", "GB": "United Kingdom", "CA": "Canada",
    "AU": "Australia", "DE": "Germany", "FR": "France", "JP": "Japan", "BR": "Brazil",
    "SG": "Singapore", "KR": "South Korea", "ES": "Spain", "IT": "Italy",
}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def main() -> int:
    try:
        import yt_dlp
    except ImportError as exc:
        raise SystemExit("Missing yt-dlp. Install it with: python -m pip install yt-dlp") from exc

    geo = os.environ.get("GEO_INPUT", "ALL").upper()
    regions = list(REGIONS) if geo == "ALL" else [geo]
    if any(code not in REGIONS for code in regions):
        raise SystemExit(f"Unsupported region: {geo}")

    for code in regions:
        trends_file = DATA / f"trends-{code}.json"
        if not trends_file.exists():
            print(f"{code}: no Google Trends snapshot; skipping YouTube discovery")
            continue
        trends = json.loads(trends_file.read_text(encoding="utf-8"))
        topics = [str(item.get("query", "")).strip() for item in trends.get("items", [])]
        topics = [topic for topic in topics if topic][:8]
        if not topics:
            print(f"{code}: no real trend topics yet; writing an empty, non-live YouTube snapshot")
            payload = {
                "schema_version": 1, "source": "yt-dlp YouTube search seeded by Google Trends RSS",
                "region": code, "region_name": REGIONS[code], "last_checked_at": utc_now(),
                "is_live_data": False, "items": [], "seed_topics": [],
                "note": "No Google Trends topics were available. This is not a YouTube-wide trending ranking.",
            }
            (DATA / f"youtube-{code}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            continue

        collected: list[dict[str, Any]] = []
        seen: set[str] = set()
        options = {
            "quiet": True, "no_warnings": True, "skip_download": True,
            "extract_flat": False, "ignoreerrors": True, "socket_timeout": 15,
            "playlistend": 5, "extractor_retries": 1, "retries": 1,
            "geo_bypass": False,
        }
        with yt_dlp.YoutubeDL(options) as ydl:
            for topic in topics:
                query = f"ytsearch5:{topic}"
                try:
                    result = ydl.extract_info(query, download=False)
                except Exception as exc:  # preserve partial results if one query is blocked
                    print(f"{code}: YouTube search failed for {topic!r}: {exc}")
                    continue
                for row in (result or {}).get("entries", []) or []:
                    if not row:
                        continue
                    video_id = str(row.get("id") or "")
                    title = str(row.get("title") or "").strip()
                    if not video_id or not title or video_id in seen:
                        continue
                    url = row.get("webpage_url") or f"https://www.youtube.com/watch?v={video_id}"
                    if not str(url).startswith("https://www.youtube.com/"):
                        continue
                    seen.add(video_id)
                    upload_date = row.get("upload_date")
                    published_at = None
                    if isinstance(upload_date, str) and re.fullmatch(r"\d{8}", upload_date):
                        published_at = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:]}T00:00:00Z"
                    collected.append({
                        "video_id": video_id, "title": title,
                        "channel": row.get("channel") or row.get("uploader") or "Channel unavailable",
                        "channel_id": row.get("channel_id"), "published_at": published_at,
                        "duration_seconds": row.get("duration"),
                        "description": (row.get("description") or "")[:350],
                        "thumbnail": row.get("thumbnail"),
                        "view_count": row.get("view_count") if isinstance(row.get("view_count"), int) else None,
                        "like_count": row.get("like_count") if isinstance(row.get("like_count"), int) else None,
                        "position": len(collected) + 1, "matched_topic": topic,
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                    })
                    if len(collected) >= 30:
                        break
                if len(collected) >= 30:
                    break

        payload = {
            "schema_version": 1,
            "source": "YouTube search via yt-dlp, seeded by Google Trends Trending Now RSS",
            "region": code, "region_name": REGIONS[code], "last_checked_at": utc_now(),
            "is_live_data": bool(collected), "items": collected,
            "seed_topics": topics,
            "note": "These are videos returned by YouTube search for current Google Trends topics, not an official YouTube-wide trending ranking. Search order is not a trend rank; views are total views, not view velocity. Some metadata may be unavailable.",
        }
        (DATA / f"youtube-{code}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{code}: saved {len(collected)} YouTube topic-related videos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
