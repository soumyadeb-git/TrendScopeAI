# TrendScope AI v2 — Google Trends intelligence for GitHub Pages

TrendScope is a GitHub Pages-ready trend dashboard. It fetches Google's public Trending Now RSS export with GitHub Actions, publishes timestamped JSON snapshots with the static site, and analyzes the currently saved data in the browser. Snapshot JSON is restored from the previous published site so comparisons work without writing an automated commit every refresh.

## What it does

- Fetches Google Trends RSS for India, United States, United Kingdom, Canada, Australia, Germany, France, Japan, Brazil, Singapore, South Korea, Spain and Italy.
- Runs a scheduled refresh about every 10 minutes. GitHub may delay scheduled jobs; this is near-real-time polling, not a guaranteed live connection.
- Displays the last successful snapshot fetch and stale-data warnings. The website polls the JSON snapshot every two minutes, but new data is available only after the GitHub Actions job succeeds.
- Preserves the RSS feed order, approximate traffic label, description, per-item RSS timestamp, related news (when supplied), and prior-snapshot feed position.
- Flags topics newly appearing in the saved snapshot, tracks RSS feed-position changes, compares approximate traffic buckets with the previous snapshot, and records a consecutive-observation streak. Feed order is not a Google search-volume rank; traffic-bucket changes are not exact growth percentages.
- Provides region selection, topic search, category filter, sort choices, CSV/JSON export, three-topic comparison, a browser-local watchlist, and Google Trends / Google Search links.
- Includes an inbuilt, offline-capable Trend Analyst and Content Opportunity Studio. The local engine analyzes the loaded dataset, answers common data questions, generates English/Bengali/Hindi content angles, hooks, title options, outlines, CTAs and hashtag ideas, and allows copying/downloading the plan.
- Uses no paid AI API, API key, server, database or third-party JavaScript framework.

## Important data accuracy choices

**The RSS feed is the source of record for the displayed rows.** The app does not invent live sample topics when no fetch has succeeded.

Google's RSS does not expose every field shown in the full Trending Now interface. This project therefore does not claim to have an exact search count, official trend growth percentage, official category, or confirmed trend start time when RSS has not provided it. Approximate traffic labels such as `200K+` are kept as labels; numeric values used for sorting are lower-bound approximations only. RSS feed order is not treated as ranking by traffic or relevance. Per-item timestamps are labelled as RSS timestamps and shown as received rather than independently verified trend start times. Category labels and the 0–100 local opportunity score are heuristics, not official Google metrics. Scores are relative to the current country snapshot and can change when its topic mix changes; topics with no usable scoring signals show no score rather than an invented midpoint.

The built-in “AI” is a **local explainable analysis / decision engine**, not a generative LLM. Its local opportunity score uses relative traffic buckets, RSS timestamp recency, and adjacent-snapshot bucket direction when available. The analyst also summarizes new topics, category mix, bucket shifts and persistence; the content studio uses topic-specific templates. Feed order is not a scoring input. The score combines only the relative reported traffic bucket, RSS timestamp recency and previous-snapshot bucket direction when available. It cannot discover facts or verify a news event by itself. Confirm claims via primary or reputable reporting before publishing.

## Set up on GitHub Pages

1. Create a new GitHub repository and push **all files** in this folder to its `main` branch. Keep `.github/workflows/update-trends.yml` in the repository.
2. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
3. Open **Actions → Refresh Google Trends and deploy dashboard → Run workflow**, choose `ALL`, and run it. The workflow fetches each configured region, then deploys the static website with the saved snapshots.
4. Open the Pages URL under **Settings → Pages** and reload. After a successful fetch, the snapshot timestamp should be recent and the non-live warning should be gone. No repository write permission or secret token is required.

All regions start with empty, non-live bootstrap snapshots by design. This avoids displaying invented example searches as if they were current trends. Run the initial `ALL` workflow to populate each region; a region whose feed fails remains clearly stale/empty rather than being filled with made-up topics.

## Refresh behaviour

- Scheduled job: every 10 minutes (`*/10 * * * *`). This is near-real-time for a static site, not a guaranteed live connection; GitHub may delay or queue scheduled runs. GitHub does not guarantee exact start times.
- In-browser polling: every 2 minutes, to pick up the latest published JSON snapshot after a deployment.
- The **Check latest snapshot** button reloads the static JSON from GitHub Pages. It does not directly start a GitHub Action, because a public static page must not contain a repository write token.
- To fetch immediately, open **Actions → Refresh Google Trends and deploy dashboard → Run workflow**. You may choose a single region or `ALL`.
- Successful fetches refresh `last_checked_at` even when trend content is unchanged. The latest snapshot includes the prior feed position, traffic bucket, first-observed time and consecutive-snapshot count where available; this is a short adjacent-snapshot comparison, not a full historical time series.
- Before each fetch, the workflow tries to restore the previous published JSON snapshots. If Google changes the RSS feed, throttles requests or a region fails, the previous valid snapshot for that region is retained and republished. Inspect the Actions log for failures.

## Local testing

Use Python 3.10+; the fetcher uses only the standard library. Run:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` from this folder. The page should clearly show that data has not been fetched yet. To fetch actual RSS data on a machine with outbound access:

```bash
python scripts/fetch_trends.py --geo IN
# or fetch every supported region
python scripts/fetch_trends.py --geo ALL
```

Run the parser tests:

```bash
python -m unittest discover -s tests -v
node --check assets/app.js
```

## Project layout

```text
trendscope-ai/
├── index.html
├── assets/
│   ├── app.js
│   └── styles.css
├── data/
│   └── trends-*.json            # empty, non-live bootstrap snapshots
├── scripts/
│   └── fetch_trends.py          # feed fetcher, parser and snapshot writer
├── tests/
│   └── test_fetch_trends.py
└── .github/workflows/
    └── update-trends.yml
```

## Sources

- Google Trends Trending Now help and supported RSS export: https://support.google.com/trends/answer/3076011
- Google Trends data FAQ: https://support.google.com/trends/answer/4365533
- Google Trends API alpha announcement (the API is not required by this project): https://developers.google.com/search/blog/2025/07/trends-api

TrendScope is an independent project and is not affiliated with, endorsed by or sponsored by Google.
