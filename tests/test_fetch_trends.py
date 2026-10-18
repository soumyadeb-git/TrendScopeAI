import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import fetch_trends  # noqa: E402

SAMPLE_RSS = '''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss/">
  <channel>
    <title>Daily Search Trends</title>
    <item>
      <title>Example Cricket Match</title>
      <ht:approx_traffic>200K+</ht:approx_traffic>
      <description><![CDATA[An <b>illustrative</b> description.]]></description>
      <pubDate>Sun, 18 Oct 2026 03:15:00 GMT</pubDate>
      <link>https://trends.google.com/trending?geo=IN</link>
      <ht:news_item>
        <ht:news_item_title>Confirmed match update</ht:news_item_title>
        <ht:news_item_url>https://news.example.test/match</ht:news_item_url>
        <ht:news_item_source>Example News</ht:news_item_source>
      </ht:news_item>
    </item>
    <item>
      <title>Example Cricket Match</title>
      <ht:approx_traffic>200K+</ht:approx_traffic>
    </item>
    <item>
      <title>Another Smartphone Launch</title>
      <ht:approx_traffic>1.5M+</ht:approx_traffic>
      <description>New tech</description>
    </item>
    <item>
      <title>Topic with unavailable traffic</title>
      <description>Missing traffic is not a zero count.</description>
    </item>
  </channel>
</rss>'''


class FetchTrendsTests(unittest.TestCase):
    def test_parse_volume(self):
        self.assertEqual(fetch_trends.parse_volume("500+"), 500)
        self.assertEqual(fetch_trends.parse_volume("200K+"), 200_000)
        self.assertEqual(fetch_trends.parse_volume("1.5M+"), 1_500_000)
        self.assertEqual(fetch_trends.parse_volume("unknown"), None)
        self.assertEqual(fetch_trends.parse_volume(""), None)

    def test_parse_rss_and_dedupe(self):
        items = fetch_trends.parse_rss(SAMPLE_RSS, "IN")
        self.assertEqual(len(items), 3)
        self.assertEqual(items[0]["query"], "Example Cricket Match")
        self.assertEqual(items[0]["search_volume"], 200_000)
        self.assertEqual(items[0]["search_volume_label"], "200K+")
        self.assertEqual(items[0]["categories"], ["Sports"])
        self.assertEqual(items[0]["feed_position"], 1)
        self.assertIn("illustrative description", items[0]["description"])
        self.assertEqual(items[0]["news"][0]["title"], "Confirmed match update")
        self.assertEqual(items[1]["search_volume"], 1_500_000)
        self.assertEqual(items[1]["categories"], ["Technology"])
        self.assertIsNone(items[2]["search_volume"])
        self.assertEqual(items[2]["search_volume_label"], "Not reported by RSS")
        self.assertIsNone(items[2]["pub_date"])

    def test_parser_rejects_html_and_empty_feed(self):
        with self.assertRaisesRegex(ValueError, "RSS channel"):
            fetch_trends.parse_rss("<html><body>Blocked</body></html>", "IN")
        with self.assertRaisesRegex(ValueError, "no trend items"):
            fetch_trends.parse_rss("<rss><channel><title>empty</title></channel></rss>", "IN")

    def test_parse_date(self):
        parsed = fetch_trends.parse_pub_date("Sun, 18 Oct 2026 03:15:00 GMT")
        self.assertEqual(parsed, "2026-10-18T03:15:00Z")
        parsed_with_offset = fetch_trends.parse_pub_date("Sun, 18 Oct 2026 08:45:00 +0530")
        self.assertEqual(parsed_with_offset, "2026-10-18T03:15:00Z")
        self.assertIsNone(fetch_trends.parse_pub_date("not a date"))

    def test_snapshot_freshness_and_previous_feed_position(self):
        with tempfile.TemporaryDirectory(dir=fetch_trends.ROOT / "tests") as tempdir:
            temp_path = Path(tempdir)
            first = [
                {"query": "Alpha", "feed_position": 1, "search_volume": 500, "search_volume_label": "500+"},
                {"query": "Beta", "feed_position": 2, "search_volume": 200, "search_volume_label": "200+"},
                {"query": "Delta", "feed_position": 3, "search_volume": 100, "search_volume_label": "100+"},
            ]
            with patch.object(fetch_trends, "DATA_DIR", temp_path), patch.object(fetch_trends, "utc_now", return_value="2026-10-18T00:00:00Z"):
                fetch_trends.write_snapshot("IN", first)
                old = json.loads((temp_path / "trends-IN.json").read_text(encoding="utf-8"))
                self.assertTrue(old["is_live_data"])
                self.assertEqual(old["last_checked_at"], "2026-10-18T00:00:00Z")
                second = [
                    {"query": "Beta", "feed_position": 1, "search_volume": 300, "search_volume_label": "300+"},
                    {"query": "Delta", "feed_position": 2, "search_volume": 100, "search_volume_label": "100+"},
                    {"query": "Alpha", "feed_position": 3, "search_volume": 400, "search_volume_label": "400+"},
                    {"query": "Gamma", "feed_position": 4, "search_volume": 100, "search_volume_label": "100+"},
                ]
                with patch.object(fetch_trends, "utc_now", return_value="2026-10-18T00:15:00Z"):
                    fetch_trends.write_snapshot("IN", second)
                new = json.loads((temp_path / "trends-IN.json").read_text(encoding="utf-8"))
            self.assertEqual(new["snapshot_at"], "2026-10-18T00:15:00Z")
            self.assertEqual(new["previous_snapshot_at"], "2026-10-18T00:00:00Z")
            self.assertTrue(new["comparison_available"])
            self.assertEqual(new["items"][0]["previous_feed_position"], 2)
            self.assertFalse(new["items"][0]["new_in_snapshot"])
            self.assertEqual(new["items"][0]["consecutive_snapshots"], 2)
            self.assertEqual(new["items"][0]["traffic_bucket_change"], "up")
            self.assertEqual(new["items"][0]["previous_search_volume_label"], "200+")
            self.assertEqual(new["items"][1]["traffic_bucket_change"], "same")
            self.assertFalse(new["items"][1]["new_in_snapshot"])
            self.assertEqual(new["items"][1]["consecutive_snapshots"], 2)
            self.assertEqual(new["items"][2]["traffic_bucket_change"], "down")
            self.assertFalse(new["items"][2]["new_in_snapshot"])
            self.assertTrue(new["items"][3]["new_in_snapshot"])
            self.assertIsNone(new["items"][3]["traffic_bucket_change"])
            self.assertEqual(new["items"][3]["consecutive_snapshots"], 1)


if __name__ == "__main__":
    unittest.main()
