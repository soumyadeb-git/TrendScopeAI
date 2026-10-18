# TrendScope AI — Google Trends + YouTube discovery dashboard

A responsive static website designed for GitHub Pages. GitHub Actions fetches Google's public Trending Now RSS feed and searches YouTube for videos related to those trend topics. Browser-side JavaScript provides the dashboard, comparison tools, saved topics, explainable scoring, and a local content-planning assistant.

**No paid API, Google Trends API key, YouTube Data API key, database, or backend server is required.** Google Trends is parsed using Python's standard library. YouTube discovery uses the free, open-source [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) Python package. YouTube may restrict automated access or change its pages; the workflow retains the last successful snapshot when it cannot get new usable results.

## Features

- Google Trends RSS snapshots for 13 regions: India, United States, United Kingdom, Canada, Australia, Germany, France, Japan, Brazil, Singapore, South Korea, Spain and Italy.
- Scheduled Google Trends collection every 10 minutes and YouTube discovery hourly. GitHub may delay scheduled workflow runs, so these are polling intervals, not guarantees.
- Browser data refresh every 2 minutes, with stale/empty-data messaging.
- Topic search, inferred category filter, sorting, CSV/JSON export, three-topic comparison, saved topics, Google Trends Explore links and a light/dark theme.
- Responsive typography and layout for desktop, tablet and phone screens.
- YouTube video discoveries seeded by the selected region's current Google Trends topics. Video cards show available title, channel, thumbnail, upload date and total views.
- Built-in, explainable Trend Analyst and Content Opportunity Studio. Analysis and content ideas are generated locally from the loaded dataset; no cloud LLM or paid AI service is called.
- Tests for the RSS parser, YouTube metadata normalizer, failed-refresh preservation, static DOM references and snapshot JSON files.

## Accuracy notes

The Google Trends RSS feed is the source of record for trend rows. It does not provide every field shown on the full Trending Now website. The dashboard therefore avoids fabricating exact query counts, growth rates, trend start times or Google rankings. RSS feed position is only its position in the RSS document. Traffic labels such as `200K+` are approximate buckets, not exact counts. The category and opportunity score are local heuristics, not official Google metrics.

YouTube results are search results for topics collected from Google Trends, **not an official YouTube-wide trending list**. Their displayed search-result order is not a popularity rank. `view_count` is total views when available, not views per hour or evidence of momentum. Search results may not be strictly local to the chosen country. Never interpret an absent value as zero.

The inbuilt “AI” is an offline rules-based analysis engine, not a generative large language model. It summarizes observed values and creates content outlines without a remote AI API. Always verify factual claims with reliable sources before publication.

## Complete repository structure

```text
TrendScopeAI/
├── .github/
│   └── workflows/
│       ├── update-trends.yml     # Google Trends, hourly YouTube, GitHub Pages deploy
│       └── validate.yml          # Syntax, JSON and unit tests on push/PR
├── assets/
│   ├── app.js                    # Dashboard, local analyst, YouTube cards
│   └── styles.css                # Responsive/dark/light styles
├── data/
│   ├── trends-<GEO>.json         # Google Trends snapshots (empty bootstrap files)
│   └── youtube-<GEO>.json        # YouTube snapshots (empty bootstrap files)
├── scripts/
│   ├── ensure_snapshots.py       # Creates/repairs missing bootstrap data
│   ├── fetch_trends.py           # Fetches and compares Google Trends RSS
│   └── fetch_youtube.py          # Discovers topic-related videos using yt-dlp
├── tests/
│   ├── test_fetch_trends.py
│   ├── test_fetch_youtube.py
│   └── test_project_integrity.py
├── requirements.txt              # yt-dlp only
├── index.html
└── README.md
```

## Install and publish on GitHub Pages

1. Create or use the repository and upload **all contents** of this folder to the `main` branch. Keep the `.github/workflows/` directory and its YAML files.
2. In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
3. Go to **Actions → Refresh Google Trends and YouTube, then deploy → Run workflow** and choose `ALL`. This initial manual run validates the code, collects live data where the sources allow access, and deploys the site.
4. Open the site URL shown under **Settings → Pages** after the action completes.

The initial deployment uses empty snapshots, not fake sample topics. The first successful RSS fetch populates Google Trends data; YouTube discovery runs after Trends data exists. Later, Trends snapshots are refreshed on the 10-minute schedule and YouTube discoveries on the hourly schedule. Code pushes run the separate validation workflow, and the next refresh schedule or a manual run publishes changes.

### Workflow schedules

- `*/10 * * * *` — collect Google Trends RSS for all regions and deploy.
- `7 * * * *` — refresh YouTube search discoveries for all regions and deploy.
- Manual dispatch — refresh both data sources for the selected region(s).

GitHub only runs scheduled workflows from the repository's default branch, and scheduled starts can be delayed or dropped during high load. The page's “Check latest snapshot” button reloads published JSON; it cannot safely launch a GitHub Action from an unauthenticated static page.

The workflow deliberately does **not** enable `setup-python`'s pip cache, which avoids the error about missing `requirements.txt` or `pyproject.toml` in `setup-python`. The repository also includes `requirements.txt` for the one external Python dependency.

## Run locally

Requires Python 3.10+ and Node.js for JavaScript syntax checks.

```bash
python -m pip install -r requirements.txt
python scripts/ensure_snapshots.py
python -m unittest discover -s tests -v
node --check assets/app.js
python -m http.server 8000
```

Open `http://localhost:8000`. To fetch current Google Trends RSS locally:

```bash
python scripts/fetch_trends.py --geo IN
python scripts/fetch_trends.py --geo ALL
```

To fetch topic-related YouTube results after Google Trends data exists:

```bash
python scripts/fetch_youtube.py --geo IN
python scripts/fetch_youtube.py --geo ALL
```

The collectors require outbound internet access. If Google or YouTube throttles the runner, the workflow logs a warning and deploys the last known-good snapshots rather than substituting fake current trends.

## Source links

- Google Trends Trending Now / RSS help: <https://support.google.com/trends/answer/3076011>
- Google Trends data FAQ: <https://support.google.com/trends/answer/4365533>
- yt-dlp project: <https://github.com/yt-dlp/yt-dlp>

TrendScope is an independent project and is not affiliated with or endorsed by Google or YouTube.
