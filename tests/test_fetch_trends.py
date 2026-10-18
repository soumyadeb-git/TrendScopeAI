import sys
import unittest
from pathlib import Path

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
  </channel>
</rss>'''


class FetchTrendsTests(unittest.TestCase):
    def test_parse_volume(self):
        self.assertEqual(fetch_trends.parse_volume("500+"), 500)
        self.assertEqual(fetch_trends.parse_volume("200K+"), 200_000)
        self.assertEqual(fetch_trends.parse_volume("1.5M+"), 1_500_000)
        self.assertIsNone(fetch_trends.parse_volume("unknown"))

    def test_parse_rss_and_dedupe(self):
        items = fetch_trends.parse_rss(SAMPLE_RSS, "IN")
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["query"], "Example Cricket Match")
        self.assertEqual(items[0]["search_volume"], 200_000)
        self.assertEqual(items[0]["categories"], ["Sports"])
        self.assertIn("illustrative description", items[0]["description"])
        self.assertEqual(items[1]["search_volume"], 1_500_000)
        self.assertEqual(items[1]["categories"], ["Technology"])

    def test_parse_date(self):
        parsed = fetch_trends.parse_pub_date("Sun, 18 Oct 2026 03:15:00 GMT")
        self.assertEqual(parsed, "2026-10-18T03:15:00Z")
        parsed_with_offset = fetch_trends.parse_pub_date("Sun, 18 Oct 2026 08:45:00 +0530")
        self.assertEqual(parsed_with_offset, "2026-10-18T03:15:00Z")


if __name__ == "__main__":
    unittest.main()
