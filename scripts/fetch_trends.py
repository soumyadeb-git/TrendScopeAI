#!/usr/bin/env python3
"""Fetch Google Trends Trending Now RSS and save static JSON snapshots.

Uses Google's RSS export rather than an undocumented JSON endpoint. The dashboard is
static; GitHub Actions runs this script on a schedule and commits changed snapshots.
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
    "IN": "India",
    "US": "United States",
    "GB": "United Kingdom",
    "CA": "Canada",
    "AU": "Australia",
}
RSS_URL = "https://trends.google.com/trending/rss?geo={geo}"
TRENDING_URL = "https://trends.google.com/trending?geo={geo}"

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
    """Return XML local name without its namespace or prefix."""
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


def get_child_text(element: ET.Element, names: tuple[str, ...]) -> str:
    for child in list(element):
        if local_name(child.tag) in names and child.text:
            text = clean_text(child.text)
            if text:
                return text
    return ""


def get_all_texts(element: ET.Element, names: tuple[str, ...]) -> list[str]:
    values = []
    for child in element.iter():
        if child is element:
            continue
        if local_name(child.tag) in names and child.text:
            text = clean_text(child.text)
            if text:
                values.append(text)
    return values


def parse_volume(label: str) -> int | None:
    """Parse labels like 500+, 200K+, 1.5M+ into rough numeric values."""
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
        if any(word in text for word in words):
            return category
    return "Other"


def parse_pub_date(value: str) -> str | None:
    if not value:
        return None
    # RSS normally uses RFC 822 dates; accept ISO timestamps as a compatibility fallback.
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, OverflowError):
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def parse_rss(xml_text: str, geo: str) -> list[dict[str, Any]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"Google Trends returned invalid RSS/XML: {exc}") from exc

    channel = next((node for node in root.iter() if local_name(node.tag) == "channel"), root)
    items: list[dict[str, Any]] = []
    seen = set()
    for node in list(channel):
        if local_name(node.tag) != "item":
            continue
        title = get_child_text(node, ("title",))
        if not title:
            continue
        key = title.casefold()
        if key in seen:
            continue
        seen.add(key)
        volume_label = get_child_text(node, ("approx_traffic", "search_volume", "traffic"))
        if not volume_label:
            # Some feeds nest the provider-specific traffic field below another element.
            volume_candidates = get_all_texts(node, ("approx_traffic",))
            volume_label = volume_candidates[0] if volume_candidates else ""
        description = get_child_text(node, ("description", "summary"))
        if len(description) > 700:
            description = description[:697].rstrip() + "…"
        pub_date = parse_pub_date(get_child_text(node, ("pubdate", "published", "updated")))
        item_link = get_child_text(node, ("link",))
        if not item_link:
            item_link = TRENDING_URL.format(geo=geo)

        news: list[dict[str, str]] = []
        for child in list(node):
            if local_name(child.tag) not in ("news_item", "newsitem"):
                continue
            news_item = {
                "title": get_child_text(child, ("news_item_title", "title")),
                "url": get_child_text(child, ("news_item_url", "url", "link")),
                "source": get_child_text(child, ("news_item_source", "source")),
                "snippet": get_child_text(child, ("news_item_snippet", "snippet", "description")),
            }
            if any(news_item.values()):
                news.append(news_item)

        items.append({
            "query": title,
            "search_volume": parse_volume(volume_label),
            "search_volume_label": volume_label or "Not available",
            "pub_date": pub_date,
            "description": description,
            "link": item_link,
            "categories": [infer_category(title, description)],
            "news": news,
            "source": "google_trends_rss",
        })

    return items


def fetch_rss(geo: str) -> str:
    url = RSS_URL.format(geo=urllib.parse.quote(geo))
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; TrendScopeAI/1.0; +https://github.com/)",
            "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def write_snapshot(geo: str, items: list[dict[str, Any]], force: bool = False) -> bool:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"trends-{geo}.json"
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    payload = {
        "geo": geo,
        "country": COUNTRIES[geo],
        "source": "Google Trends Trending Now RSS",
        "source_url": TRENDING_URL.format(geo=geo),
        "rss_url": RSS_URL.format(geo=geo),
        "snapshot_at": now,
        "demo": False,
        "items": items,
    }

    # Avoid pointless commits for every scheduled run: the snapshot timestamp is
    # updated only when the actual trend content changes (or a snapshot is missing).
    if path.exists() and not force:
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
            if comparable_content(previous) == comparable_content(payload):
                print(f"[{geo}] No trend content changes; leaving snapshot untouched.")
                return False
        except (json.JSONDecodeError, OSError):
            pass
    rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(rendered, encoding="utf-8")
    temporary.replace(path)
    print(f"[{geo}] Saved {len(items)} trends to {path.relative_to(ROOT)}")
    return True


def comparable_content(payload: dict[str, Any]) -> str:
    """Exclude volatile snapshot time when checking if a commit is needed."""
    stable = {key: value for key, value in payload.items() if key != "snapshot_at"}
    return json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def update_geo(geo: str, retries: int = 2) -> bool:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            xml_text = fetch_rss(geo)
            items = parse_rss(xml_text, geo)
            if not items:
                raise ValueError("RSS feed parsed successfully but contained no trend items; keeping previous snapshot.")
            return write_snapshot(geo, items)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            last_error = exc
            if attempt < retries:
                pause = 2 ** attempt
                print(f"[{geo}] Attempt {attempt + 1} failed: {exc}; retrying in {pause}s.", file=sys.stderr)
                time.sleep(pause)
    print(f"[{geo}] ERROR: {last_error}", file=sys.stderr)
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geo", choices=[*COUNTRIES, "ALL"], default="ALL", help="Region to update, or ALL (default).")
    parser.add_argument("--force", action="store_true", help="Write a new snapshot even when trend data is unchanged.")
    args = parser.parse_args()
    targets = list(COUNTRIES) if args.geo == "ALL" else [args.geo]
    successes = 0
    for geo in targets:
        try:
            xml_text = fetch_rss(geo)
            items = parse_rss(xml_text, geo)
            if not items:
                raise ValueError("RSS feed returned no trend items; existing snapshot was preserved.")
            if write_snapshot(geo, items, force=args.force):
                successes += 1
            else:
                # An unchanged snapshot counts as a successful refresh.
                successes += 1
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            print(f"[{geo}] ERROR: {exc}", file=sys.stderr)
        if len(targets) > 1:
            time.sleep(1)
    if successes == 0:
        print("No region snapshots could be updated. Existing data was not overwritten.", file=sys.stderr)
        return 1
    print(f"Completed update run: {successes}/{len(targets)} regions processed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
