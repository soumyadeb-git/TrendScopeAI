import json
import re
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import ensure_snapshots  # noqa: E402


class IdCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key == "id" and value:
                self.ids.add(value)


class ProjectIntegrityTests(unittest.TestCase):
    def test_all_expected_snapshot_files_exist_and_are_valid_json(self):
        ensure_snapshots.ensure_snapshots()
        for geo in ensure_snapshots.REGIONS:
            for kind in ("trends", "youtube"):
                path = ROOT / "data" / f"{kind}-{geo}.json"
                self.assertTrue(path.is_file(), str(path))
                payload = json.loads(path.read_text(encoding="utf-8"))
                self.assertIsInstance(payload, dict)
                self.assertIsInstance(payload.get("items"), list)
                self.assertIn("is_live_data", payload)

    def test_every_static_javascript_dom_reference_exists_in_html(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        collector = IdCollector()
        collector.feed(html)
        js = (ROOT / "assets" / "app.js").read_text(encoding="utf-8")
        referenced = set(re.findall(r"\$\('([^']+)'\)", js))
        missing = sorted(referenced - collector.ids)
        self.assertFalse(missing, f"JavaScript refers to missing static HTML IDs: {missing}")

    def test_workflow_does_not_enable_pip_cache_without_a_lock_or_requirements_file(self):
        workflow = (ROOT / ".github" / "workflows" / "update-trends.yml").read_text(encoding="utf-8")
        # The previous reported failure occurred because setup-python pip cache couldn't
        # discover the dependency file. This project intentionally installs requirements
        # explicitly and leaves cache discovery disabled.
        self.assertIn("python-version: '3.12'", workflow)
        self.assertNotRegex(workflow, r"(?m)^\s*cache:\s*pip\s*$")
        self.assertTrue((ROOT / "requirements.txt").is_file())
        self.assertIn("python -m pip install", workflow)

    def test_frontend_and_scripts_exist(self):
        required = [
            ROOT / "index.html",
            ROOT / "assets" / "app.js",
            ROOT / "assets" / "styles.css",
            ROOT / "scripts" / "fetch_trends.py",
            ROOT / "scripts" / "fetch_youtube.py",
            ROOT / "scripts" / "ensure_snapshots.py",
            ROOT / ".github" / "workflows" / "update-trends.yml",
        ]
        for path in required:
            self.assertTrue(path.is_file(), f"Missing required project file: {path.relative_to(ROOT)}")


if __name__ == "__main__":
    unittest.main()
