import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import fetch_youtube  # noqa: E402


class FetchYoutubeTests(unittest.TestCase):
    def test_upload_date_parsing(self):
        self.assertEqual(fetch_youtube.parse_upload_date("20261018"), "2026-10-18T00:00:00Z")
        self.assertIsNone(fetch_youtube.parse_upload_date("20260230"))
        self.assertIsNone(fetch_youtube.parse_upload_date("not-a-date"))
        self.assertIsNone(fetch_youtube.parse_upload_date(None))

    def test_normalise_video_entry_does_not_invent_metadata(self):
        result = fetch_youtube.normalise_video_entry(
            {
                "id": "abcdefghijk",
                "title": "A real title from the extractor",
                "webpage_url": "https://evil.example/watch?v=wrong",
                "view_count": None,
                "like_count": "not-a-number",
                "duration": None,
                "thumbnail": "http://example.test/image.jpg",
                "upload_date": "20261018",
            },
            "Example topic",
            1,
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["url"], "https://www.youtube.com/watch?v=abcdefghijk")
        self.assertIsNone(result["view_count"])
        self.assertIsNone(result["like_count"])
        self.assertIsNone(result["duration_seconds"])
        self.assertIsNone(result["thumbnail"])
        self.assertEqual(result["published_at"], "2026-10-18T00:00:00Z")
        self.assertEqual(result["result_order"], 1)

    def test_normalise_rejects_missing_id_or_title(self):
        self.assertIsNone(fetch_youtube.normalise_video_entry({"id": "short", "title": "Title"}, "Topic", 1))
        self.assertIsNone(fetch_youtube.normalise_video_entry({"id": "abcdefghijk", "title": " "}, "Topic", 1))

    def test_discovers_only_three_trend_topics_and_writes_schema(self):
        class FakeYoutubeDL:
            requested = []

            def __init__(self, options):
                self.options = options

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def extract_info(self, query, download=False):
                self.requested.append(query)
                topic = query.split(":", 1)[1]
                # Eleven-character synthetic IDs in a unit test are not live data.
                vid = {"Alpha": "abcdefghijk", "Beta": "lmnopqrstuv", "Gamma": "wxyzABCDEFG"}[topic]
                return {"entries": [{"id": vid, "title": f"Video about {topic}", "channel": "Test channel"}]}

        class FakeModule:
            YoutubeDL = FakeYoutubeDL

        with tempfile.TemporaryDirectory() as temp:
            data_dir = Path(temp)
            (data_dir / "trends-IN.json").write_text(json.dumps({
                "geo": "IN",
                "is_live_data": True,
                "items": [{"query": x} for x in ["Alpha", "Beta", "Gamma", "Delta"]],
            }), encoding="utf-8")
            with patch.object(fetch_youtube, "DATA", data_dir):
                result = fetch_youtube.discover_region("IN", FakeModule)
                payload = json.loads((data_dir / "youtube-IN.json").read_text(encoding="utf-8"))

        self.assertTrue(result)
        self.assertEqual(len(FakeYoutubeDL.requested), 3)
        self.assertEqual(payload["region"], "IN")
        self.assertTrue(payload["is_live_data"])
        self.assertEqual(len(payload["items"]), 3)
        self.assertEqual(payload["seed_topics"], ["Alpha", "Beta", "Gamma"])
        self.assertNotIn("position", payload["items"][0])
        self.assertIn("not an official", payload["note"])

    def test_failed_refresh_preserves_last_successful_snapshot(self):
        class FailedYoutubeDL:
            def __init__(self, options):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def extract_info(self, query, download=False):
                raise RuntimeError("simulated YouTube throttle")

        class FakeModule:
            YoutubeDL = FailedYoutubeDL

        with tempfile.TemporaryDirectory() as temp:
            data_dir = Path(temp)
            (data_dir / "trends-IN.json").write_text(json.dumps({
                "items": [{"query": "Alpha"}, {"query": "Beta"}],
            }), encoding="utf-8")
            old = {
                "schema_version": 1,
                "region": "IN",
                "last_checked_at": "2026-10-18T00:00:00Z",
                "is_live_data": True,
                "items": [{"video_id": "abcdefghijk", "title": "Previously successful"}],
            }
            (data_dir / "youtube-IN.json").write_text(json.dumps(old), encoding="utf-8")
            with patch.object(fetch_youtube, "DATA", data_dir):
                result = fetch_youtube.discover_region("IN", FakeModule)
                saved = json.loads((data_dir / "youtube-IN.json").read_text(encoding="utf-8"))

        self.assertFalse(result)
        self.assertTrue(saved["is_live_data"])
        self.assertEqual(saved["items"][0]["title"], "Previously successful")
        self.assertEqual(saved["last_checked_at"], "2026-10-18T00:00:00Z")
        self.assertIn("last_attempt_at", saved)


if __name__ == "__main__":
    unittest.main()
