# TrendScope AI — Google Trends static dashboard

TrendScope is a GitHub Pages-ready dashboard that reads Google Trends **Trending Now RSS exports**, then organizes the snapshot into an interactive trend board. It includes topic search, category filtering, sorting, CSV export, a heuristic momentum score, a category pulse chart, and content-angle suggestions.

**No server, paid API, secrets, database, or model download is required.** GitHub Actions fetches the RSS data on a schedule and commits updated JSON snapshots. GitHub Pages serves the files as a static website.

## Important: what “AI” means here

The “AI trend brief” and content suggestions are **local, explainable heuristics**, not a generative language model. The site classifies topics using keyword rules and calculates a 0–100 momentum index from the feed’s approximate search-volume label and timestamp. The index is not an official Google metric, and search volume is not the same as sales, market size, or business opportunity. Trend descriptions and content angles should be checked against reliable sources before publication.

## Publish on GitHub Pages

1. Create a **new GitHub repository** and upload/push all files in this folder to its default branch (usually `main`). Keep the `.github/workflows/update-trends.yml` file in place.
2. In the repository, open **Settings → Actions → General → Workflow permissions**. Ensure workflows are allowed to write to the repository (the workflow requests `contents: write`). Organisation policy may override this setting.
3. Open **Settings → Pages**. Under **Build and deployment**, select **Deploy from a branch**, choose `main` and `/(root)`, then Save.
4. Open **Actions → Update trend snapshots → Run workflow**. Choose `ALL` and start the run. This replaces the illustrative sample in `data/trends-IN.json` with feed data and creates the other region snapshots as well.
5. Wait for that workflow run to finish, then open the Pages URL shown in **Settings → Pages**. The scheduled workflow runs hourly; GitHub may delay scheduled jobs during busy periods.

The dashboard works at both `username.github.io/repository/` and a custom domain because all asset/data references are relative paths.

## Data source and refresh timing

- Source: `https://trends.google.com/trending/rss?geo=IN` (and the equivalent `US`, `GB`, `CA`, and `AU` feeds).
- Source page: `https://trends.google.com/trending`.
- Google documents RSS as an export option from Trending Now and says the page refreshes on average every ten minutes. This repository intentionally stores static snapshots and polls hourly by default to avoid excessive requests.
- On demand, run **Actions → Update trend snapshots → Run workflow**. Pick a single region or `ALL`.
- The action only commits when trend content has changed; it doesn't create commits solely to update timestamps.
- If the feed format changes, rate limits the request, or GitHub Actions is disabled, the site continues to serve the last saved snapshot. Check the Actions log for update errors.

Google's dedicated Trends API has been announced as an alpha with access for a limited set of testers; this project does not depend on API-alpha access.

## Regions

The workflow supports:

| Code | Region |
|---|---|
| `IN` | India |
| `US` | United States |
| `GB` | United Kingdom |
| `CA` | Canada |
| `AU` | Australia |

To add another region, add its code and label in `COUNTRIES` in `scripts/fetch_trends.py`, then add an option to the region selector in `index.html` and to the workflow input options.

## Local preview

A static HTTP server is recommended because the page fetches JSON files with `fetch()`:

```bash
python -m http.server 8000
```

Open `http://localhost:8000` from the `trendscope-ai` folder. The initial India file is **illustrative sample data**, clearly marked in the page. Run the fetch script to try loading a real RSS snapshot locally:

```bash
python scripts/fetch_trends.py --geo IN
```

No third-party Python packages are needed. The current environment must have outbound internet access to Google Trends RSS.

## Files

```text
trendscope-ai/
├── index.html
├── assets/
│   ├── app.js
│   └── styles.css
├── data/
│   └── trends-IN.json           # Demo snapshot, replaced by the updater
├── scripts/
│   └── fetch_trends.py          # RSS parser and JSON snapshot writer
├── tests/
│   └── test_fetch_trends.py
└── .github/workflows/
    └── update-trends.yml
```

## Limitations

- Static hosting cannot keep a live connection to the RSS feed without a data-fetch step. The page reads saved JSON; it does **not** fetch Google directly from the browser or pretend that the reload button starts a new scrape.
- GitHub Actions scheduled runs may start late. Use the manual workflow for an on-demand attempt.
- RSS fields can be incomplete and Google may change the feed format. Missing volume and timestamps are handled with conservative fallbacks.
- Keyword topic classification is approximate. `Other` is expected for ambiguous names and context-dependent topics.
- This is an independent community project and is not affiliated with, endorsed by, or sponsored by Google.

## Official references

- Google Trends Trending Now help and RSS export: https://support.google.com/trends/answer/3076011
- Google Trends API alpha announcement: https://developers.google.com/search/blog/2025/07/trends-api
