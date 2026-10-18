#!/usr/bin/env python3
"""Fetch the public Google Trends Trending Now RSS feeds into static snapshots.

The dashboard is hosted as static files. GitHub Actions runs this fetcher, validates
that the feed is real XML with usable trends, and writes transparent snapshot JSON.
No Google API key, package install, or third-party scraper is used.
"""
from __future__ import annotations

import argparse
import datetime as dt
from email.utils import parsedate_to_datetime
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html import unescape
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
COUNTRIES = {
    "IN": "India", "US": "United States", "GB": "United Kingdom",
    "CA": "Canada", "AU": "Australia", "DE": "Germany",
    "FR": "France", "JP": "Japan", "BR": "Brazil", "SG": "Singapore",
    "KR": "South Korea", "ES": "Spain", "IT": "Italy",
}
RSS_URL = "https://trends.google.com/trending/rss?geo={geo}"
TRENDING_URL = "https://trends.google.com/trending?geo={geo}"

# RSS does not supply official topic categories, so these labels are inferred locally.
KEYWORDS: dict[str, tuple[str, ...]] = {
    "Sports": ("cricket", "ipl", "football", "soccer", "match", "score", "tournament", "world cup", "nba", "tennis", "olympic", "fifa", " vs ", "league", "player", "team", "wicket", "goal", "race", "grand prix", "formula 1", "f1"),
    "Entertainment": ("movie", "film", "actor", "actress", "trailer", "episode", "series", "netflix", "ott", "song", "album", "concert", "singer", "celebrity", "box office", "theatre", "music", "reality show", "award"),
    "Technology": ("artificial intelligence", "google", "apple", "iphone", "android", "openai", "chatgpt", "software", "app", "launch", "update", "cyber", "tech", "robot", "chip", "samsung", "microsoft", "meta", "internet", "gadget", " ai "),
    "Politics": ("election", "minister", "government", "parliament", "president", "prime minister", "political", "vote", "policy", "congress", "bjp", "trump", "modi", "senate", "supreme court", "party leader"),
    "Finance": ("stock", "share price", "market", "nifty", "sensex", "nasdaq", "dow jones", "bitcoin", "crypto", "rupee", "dollar", "gold price", "silver price", "ipo", "interest rate", "inflation", "bank", "earnings", "trading"),
    "Business": ("company", "business", "ceo", "startup", "brand", "sales", "deal", "revenue", "merger", "industry", "retail", "product", "customer", "amazon", "flipkart", "reliance"),
    "Weather": ("weather", "rain", "storm", "cyclone", "temperature", "heatwave", "flood", "earthquake", "hurricane", "forecast", "snow", "monsoon", "air quality"),
    "Education": ("exam", "result", "admit card", "school", "college", "university", "entrance", "neet", "jee", "board exam", "syllabus", "scholarship", "education", "recruitment", "job vacancy", " jobs"),
    "Lifestyle": ("recipe", "food", "festival", "holiday", "travel", "tourism", "fashion", "wedding", "health", "fitness", "astrology", "horoscope", "puja", "temple", "beauty", "restaurant"),
}


def local_name(tag: str) -> str:
    if "}" in tag:
        tag = tag.rsplit("}", 1)[1]
    if ":" in tag:
        tag = tag.rsplit(":", 1)[1]
    return tag.lower()


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    value = unescape(value)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def child_text(element: ET.Element, names: tuple[str, ...]) -> str:
    for child in list(element):
        if local_name(child.tag) in names:
            # Some RSS fields may contain nested markup; itertext preserves the human text.
            text = clean_text(" ".join(child.itertext()))
            if text:
                return text
    return ""


def all_descendant_texts(element: ET.Element, names: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    for child in element.iter():
        if child is element:
            continue
        if local_name(child.tag) in names:
            text = clean_text(" ".join(child.itertext()))
            if text:
                values.append(text)
    return values


def parse_volume(label: str) -> int | None:
    """Parse approximate Google traffic labels such as 500+, 200K+, 1.5M+.

    The numeric result is only the displayed bucket's lower bound, not an exact count.
    """
    if not label:
        return None
    raw = label.upper().replace(",", "").strip()
    match = re.search(r"([\d]+(?:\.\d+)?)\s*([KMB])?", raw)
    if not match:
        return None
    scale = {"K": 1_000, "M": 1_000_000, "B": 1_000_000_000}.get(match.group(2) or "", 1)
    try:
        return int(float(match.group(1)) * scale)
    except (ValueError, OverflowError):
        return None


def infer_category(title: str, description: str = "") -> str:
    text = f" {title} {description} ".lower()
    for category, words in KEYWORDS.items():
        for word in words:
            if word.strip() == "ai":
                if re.search(r"(?:^|\W)ai(?:$|\W)", text):
                    return category
            elif word in text:
                return category
    return "Other"


def parse_pub_date(value: str) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_rss(xml_text: str, geo: str) -> list[dict[str, Any]]:
    if not xml_text or not xml_text.strip():
        raise ValueError("Google Trends returned an empty response.")
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        preview = re.sub(r"\s+", " ", xml_text[:160])
        raise ValueError(f"Google Trends did not return valid RSS/XML. Response began: {preview!r}") from exc

    channel = next((node for node in root.iter() if local_name(node.tag) == "channel"), None)
    if channel is None:
        raise ValueError("Google Trends response did not include an RSS channel.")

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for node in list(channel):
        if local_name(node.tag) != "item":
            continue
        title = child_text(node, ("title",))
        if not title:
            continue
        key = title.casefold()
        if key in seen:
            continue
        seen.add(key)
        volume_label = child_text(node, ("approx_traffic", "search_volume", "traffic"))
        if not volume_label:
            candidates = all_descendant_texts(node, ("approx_traffic",))
            volume_label = candidates[0] if candidates else ""
        description = child_text(node, ("description", "summary"))
        if len(description) > 900:
            description = description[:897].rstrip() + "…"
        pub_date = parse_pub_date(child_text(node, ("pubdate", "published", "updated")))
        item_link = child_text(node, ("link",)) or TRENDING_URL.format(geo=geo)
        picture = child_text(node, ("picture",))

        news: list[dict[str, str]] = []
        for child in list(node):
            if local_name(child.tag) not in ("news_item", "newsitem"):
                continue
            record = {
                "title": child_text(child, ("news_item_title", "title")),
                "url": child_text(child, ("news_item_url", "url", "link")),
                "source": child_text(child, ("news_item_source", "source")),
                "snippet": child_text(child, ("news_item_snippet", "snippet", "description")),
            }
            if any(record.values()):
                news.append(record)

        items.append({
            "query": title,
            "search_volume": parse_volume(volume_label),
            "search_volume_label": volume_label or "Not reported by RSS",
            "pub_date": pub_date,
            "description": description,
            "link": item_link,
            "picture": picture,
            "categories": [infer_category(title, description)],
            "category_source": "local_keyword_inference",
            "news": news,
            "feed_position": len(items) + 1,
            "source": "google_trends_rss",
        })

    if not items:
        raise ValueError("RSS parsed, but no trend items were found. Existing data was preserved.")
    return items


def fetch_rss(geo: str) -> str:
    url = RSS_URL.format(geo=urllib.parse.quote(geo))
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; TrendScopeAI/2.0; +https://trends.google.com/trending)",
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        "Cache-Control": "no-cache",
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status < 200 or response.status >= 300:
            raise ValueError(f"Google Trends RSS returned HTTP {response.status}.")
        charset = response.headers.get_content_charset() or "utf-8"
        body = response.read().decode(charset, errors="replace")
        if "text/html" in response.headers.get("Content-Type", "").lower() and "<rss" not in body.lower():
            raise ValueError("Google Trends returned an HTML page rather than its RSS feed.")
        return body


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def write_snapshot(geo: str, items: list[dict[str, Any]]) -> bool:
    """Write every successful observation so last_checked_at stays truthful."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"trends-{geo}.json"
    now = utc_now()
    previous: dict[str, Any] = {}
    if path.exists():
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            previous = {}

    old_items = previous.get("items", []) if not previous.get("demo") else []
    # Preserve compatibility with v2 snapshots, where this field was incorrectly
    # described as a rank even though RSS position is only feed ordering.
    old_by_query = {
        str(item.get("query", "")).casefold(): item
        for item in old_items if item.get("query")
    }
    old_positions = {
        key: (item.get("feed_position") or item.get("source_position") or index + 1)
        for index, item in enumerate(old_items) if (key := str(item.get("query", "")).casefold())
    }
    for index, item in enumerate(items, start=1):
        item["feed_position"] = index
        key = str(item.get("query", "")).casefold()
        old_item = old_by_query.get(key)
        item["previous_feed_position"] = old_positions.get(key)
        item["new_in_snapshot"] = bool(old_positions) and old_item is None
        item["previous_search_volume_label"] = old_item.get("search_volume_label") if old_item else None
        previous_volume = old_item.get("search_volume") if old_item else None
        current_volume = item.get("search_volume")
        item["previous_search_volume_lower_bound"] = previous_volume
        if old_item is None or previous_volume is None or current_volume is None:
            item["traffic_bucket_change"] = None
        elif current_volume > previous_volume:
            item["traffic_bucket_change"] = "up"
        elif current_volume < previous_volume:
            item["traffic_bucket_change"] = "down"
        else:
            item["traffic_bucket_change"] = "same"
        try:
            prior_streak = max(1, int(old_item.get("consecutive_snapshots", 1))) if old_item else 0
        except (TypeError, ValueError):
            prior_streak = 1 if old_item else 0
        item["consecutive_snapshots"] = prior_streak + 1 if old_item else 1
        item["first_observed_snapshot_at"] = (
            (old_item.get("first_observed_snapshot_at") or previous.get("snapshot_at") or now)
            if old_item else now
        )

    payload = {
        "schema_version": 3,
        "geo": geo,
        "country": COUNTRIES[geo],
        "source": "Google Trends Trending Now RSS",
        "source_url": TRENDING_URL.format(geo=geo),
        "rss_url": RSS_URL.format(geo=geo),
        "snapshot_at": now,
        "last_checked_at": now,
        "previous_snapshot_at": previous.get("snapshot_at") if not previous.get("demo") else None,
        "comparison_available": bool(old_positions),
        "refresh_interval_minutes": 10,
        "is_live_data": True,
        "demo": False,
        "data_limitations": [
            "Google RSS exposes approximate traffic labels, not exact search counts.",
            "RSS feed order is not a search-volume or Google-relevance ranking.",
            "Traffic bucket movement compares only adjacent snapshots and is not an exact growth percentage.",
            "RSS timestamps are shown as provided and are not independently verified.",
            "Category labels are inferred locally and are not supplied by Google RSS.",
            "The RSS export may contain fewer topics and fields than the full Trending Now page.",
        ],
        "items": items,
    }
    rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(rendered, encoding="utf-8")
    temporary.replace(path)
    print(f"[{geo}] Saved {len(items)} live RSS trends to {path.relative_to(ROOT)} at {now}")
    return True


def update_geo(geo: str, retries: int = 2) -> bool:
    for attempt in range(retries + 1):
        try:
            xml_text = fetch_rss(geo)
            items = parse_rss(xml_text, geo)
            write_snapshot(geo, items)
            return True
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            if attempt < retries:
                pause = 2 ** attempt
                print(f"[{geo}] Attempt {attempt + 1} failed: {exc}; retrying in {pause}s.", file=sys.stderr)
                time.sleep(pause)
            else:
                print(f"[{geo}] ERROR: {exc}", file=sys.stderr)
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geo", choices=[*COUNTRIES, "ALL"], default="ALL", help="Region to update, or ALL (default).")
    args = parser.parse_args()
    targets = list(COUNTRIES) if args.geo == "ALL" else [args.geo]
    successes = 0
    for geo in targets:
        successes += int(update_geo(geo))
        if len(targets) > 1:
            time.sleep(1)
    print(f"Completed update run: {successes}/{len(targets)} regions processed successfully.")
    # Fail the workflow if any selected region failed, so problems are visible in Actions.
    return 0 if successes == len(targets) else 1


if __name__ == "__main__":
    raise SystemExit(main())
