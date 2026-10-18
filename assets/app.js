(() => {
  'use strict';

  const GEO = {
    IN: { name: 'India', flag: '🇮🇳' }, US: { name: 'United States', flag: '🇺🇸' },
    GB: { name: 'United Kingdom', flag: '🇬🇧' }, CA: { name: 'Canada', flag: '🇨🇦' },
    AU: { name: 'Australia', flag: '🇦🇺' }, DE: { name: 'Germany', flag: '🇩🇪' },
    FR: { name: 'France', flag: '🇫🇷' }, JP: { name: 'Japan', flag: '🇯🇵' },
    BR: { name: 'Brazil', flag: '🇧🇷' }, SG: { name: 'Singapore', flag: '🇸🇬' },
    KR: { name: 'South Korea', flag: '🇰🇷' }, ES: { name: 'Spain', flag: '🇪🇸' },
    IT: { name: 'Italy', flag: '🇮🇹' }
  };
  const KEYWORDS = {
    Sports: ['cricket', 'ipl', 'football', 'soccer', 'match', 'score', 'tournament', 'world cup', 'nba', 'tennis', 'olympic', 'fifa', ' vs ', 'league', 'player', 'team', 'wicket', 'goal', 'race', 'grand prix', 'formula 1', 'f1'],
    Entertainment: ['movie', 'film', 'actor', 'actress', 'trailer', 'episode', 'series', 'netflix', 'ott', 'song', 'album', 'concert', 'singer', 'celebrity', 'box office', 'theatre', 'music', 'reality show', 'award'],
    Technology: ['artificial intelligence', 'google', 'apple', 'iphone', 'android', 'openai', 'chatgpt', 'software', 'app', 'launch', 'update', 'cyber', 'tech', 'robot', 'chip', 'samsung', 'microsoft', 'meta', 'internet', 'gadget'],
    Politics: ['election', 'minister', 'government', 'parliament', 'president', 'prime minister', 'political', 'vote', 'policy', 'congress', 'bjp', 'trump', 'modi', 'senate', 'court ruling', 'supreme court', 'party leader'],
    Finance: ['stock', 'share price', 'market', 'nifty', 'sensex', 'nasdaq', 'dow jones', 'bitcoin', 'crypto', 'rupee', 'dollar', 'gold price', 'silver price', 'ipo', 'interest rate', 'inflation', 'bank', 'earnings', 'trading'],
    Business: ['company', 'business', 'ceo', 'startup', 'brand', 'sales', 'deal', 'revenue', 'merger', 'industry', 'retail', 'product', 'customer', 'amazon', 'flipkart', 'reliance'],
    Weather: ['weather', 'rain', 'storm', 'cyclone', 'temperature', 'heatwave', 'flood', 'earthquake', 'hurricane', 'forecast', 'snow', 'monsoon', 'air quality'],
    Education: ['exam', 'result', 'admit card', 'school', 'college', 'university', 'entrance', 'neet', 'jee', 'board exam', 'syllabus', 'scholarship', 'education', 'recruitment', 'job vacancy', 'jobs', 'government job'],
    Lifestyle: ['recipe', 'food', 'festival', 'holiday', 'travel', 'tourism', 'fashion', 'wedding', 'health', 'fitness', 'astrology', 'horoscope', 'puja', 'temple', 'beauty', 'restaurant']
  };
  const CATEGORY_COLORS = {
    Sports: '#ffc58d', Entertainment: '#dba5ff', Technology: '#88c3ff', Politics: '#ff929f',
    Finance: '#83e0b5', Business: '#83e0b5', Weather: '#8bdce9', Education: '#b4a7ff',
    Lifestyle: '#f4a3c8', Other: '#a5b2cd'
  };
  const $ = (id) => document.getElementById(id);
  const safeText = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const safeUrl = (value, fallback = '#') => {
    try {
      const parsed = new URL(String(value || ''), window.location.href);
      return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : fallback;
    } catch { return fallback; }
  };
  const state = {
    geo: 'IN', payload: null, items: [], filtered: [], expanded: new Set(),
    watched: loadLocalSet('trendscope-watchlist'), compared: new Set(),
    loadedAt: null, demo: false, loadError: false, lastLoadSucceeded: false
  };

  function loadLocalSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]').map(String)); }
    catch { return new Set(); }
  }
  function saveLocalSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* Private browsing may block local storage. */ }
  }

  function normaliseCategory(item) {
    if (Array.isArray(item.categories) && item.categories.length) {
      const first = typeof item.categories[0] === 'string' ? item.categories[0] : item.categories[0]?.name;
      if (first && first !== 'Uncategorized') return first;
    }
    const text = ` ${item.query || ''} ${item.description || ''} `.toLowerCase();
    for (const [category, words] of Object.entries(KEYWORDS)) {
      for (const word of words) {
        if (word === 'ai') {
          if (/(?:^|\W)ai(?:$|\W)/.test(text)) return category;
        } else if (text.includes(word)) return category;
      }
    }
    return 'Other';
  }

  function volumeNumber(item) {
    const direct = Number(item.search_volume);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const raw = String(item.search_volume_label || item.approx_traffic || '').trim().replace(/,/g, '').toUpperCase();
    const match = raw.match(/([\d.]+)\s*([KMB])?/);
    if (!match) return 0;
    const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[match[2]] || 1;
    return Math.round(Number(match[1]) * multiplier);
  }

  function formatVolume(item) {
    const label = String(item.search_volume_label || '').trim();
    if (label && !/^(not available|not reported by rss|unknown)$/i.test(label)) return label;
    const amount = volumeNumber(item);
    if (!amount) return 'Not reported';
    if (amount >= 1e9) return `${(amount / 1e9).toFixed(amount >= 10e9 ? 0 : 1).replace(/\.0$/, '')}B+`;
    if (amount >= 1e6) return `${(amount / 1e6).toFixed(amount >= 10e6 ? 0 : 1).replace(/\.0$/, '')}M+`;
    if (amount >= 1e3) return `${(amount / 1e3).toFixed(amount >= 100e3 ? 0 : 1).replace(/\.0$/, '')}K+`;
    return `${amount.toLocaleString()}+`;
  }

  function trafficBucketSummary(item) {
    const previous = String(item.previous_search_volume_label || 'Not available');
    const current = formatVolume(item);
    if (item.traffic_bucket_change === 'up') return `Approximate traffic bucket moved up: ${previous} → ${current}`;
    if (item.traffic_bucket_change === 'down') return `Approximate traffic bucket moved down: ${previous} → ${current}`;
    if (item.traffic_bucket_change === 'same') return `Approximate traffic bucket unchanged: ${current}`;
    return 'Traffic bucket change unavailable (no comparable values in the previous snapshot).';
  }

  function trafficChangeBadge(item) {
    if (item.traffic_bucket_change === 'up') return '<span class="change-chip bucket-up">TRAFFIC BUCKET ↑</span>';
    if (item.traffic_bucket_change === 'down') return '<span class="change-chip bucket-down">TRAFFIC BUCKET ↓</span>';
    if (item.traffic_bucket_change === 'same') return '<span class="change-chip bucket-same">BUCKET UNCHANGED</span>';
    return '';
  }

  function timestampAgeHours(item) {
    const raw = item.pub_date || item.feed_timestamp || item.published_at || '';
    if (!raw) return null;
    const timestamp = Date.parse(raw);
    if (!Number.isFinite(timestamp)) return null;
    return Math.max(0, (Date.now() - timestamp) / 3600000);
  }

  function relativeAge(hours) {
    if (hours === null || !Number.isFinite(hours)) return 'Not provided';
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`;
    if (hours < 24) return `${Math.round(hours)} hr ago`;
    return `${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? '' : 's'} ago`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'time unavailable';
    return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function snapshotAgeMinutes(value) {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 60000) : null;
  }

  function relativeMinutes(minutes) {
    if (minutes === null) return 'unknown age';
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${Math.floor(minutes)} min ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
    return `${Math.floor(minutes / 1440)} day(s) ago`;
  }

  function calculateScores(items) {
    // The RSS list is not ordered by search volume or Google's relevance rank.
    // Score only observable signals: a relative traffic-bucket estimate, RSS timestamp
    // recency, and a bucket-level change vs the previous snapshot. This is not a model
    // of exact growth; labels are coarse and only adjacent snapshots are compared.
    const knownVolumes = items.map(volumeNumber).filter((value) => value > 0);
    const minLog = knownVolumes.length ? Math.min(...knownVolumes.map((value) => Math.log10(value))) : 0;
    const maxLog = knownVolumes.length ? Math.max(...knownVolumes.map((value) => Math.log10(value))) : 0;
    items.forEach((item, index) => {
      const position = Number(item.feed_position ?? item.source_position) > 0
        ? Number(item.feed_position ?? item.source_position) : index + 1;
      const volume = volumeNumber(item);
      const volumeScore = volume > 0
        ? (maxLog === minLog ? 65 : 100 * ((Math.log10(volume) - minLog) / (maxLog - minLog)))
        : null;
      const hours = timestampAgeHours(item);
      const freshnessScore = hours === null ? null : 100 * Math.exp(-hours / 48);
      const bucketChangeScore = item.traffic_bucket_change === 'up' ? 100
        : item.traffic_bucket_change === 'down' ? 20
        : item.traffic_bucket_change === 'same' ? 55 : null;
      const parts = [];
      if (volumeScore !== null) parts.push({ value: volumeScore, weight: 0.50 });
      if (freshnessScore !== null) parts.push({ value: freshnessScore, weight: 0.30 });
      if (bucketChangeScore !== null) parts.push({ value: bucketChangeScore, weight: 0.20 });
      const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
      item._score = totalWeight
        ? Math.round(parts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight)
        : null;
      item._volume = volume;
      item._age = hours;
      item._category = normaliseCategory(item);
      item._position = position;
      const previousPosition = Number(item.previous_feed_position ?? item.previous_position ?? item.previous_rank);
      item._move = Number.isFinite(previousPosition) && previousPosition > 0
        ? previousPosition - position : null;
    });
  }

  function scoreValue(item) {
    return Number.isFinite(item?._score) ? item._score : -1;
  }

  function scoreDisplay(item) {
    return Number.isFinite(item?._score) ? `${item._score}/100` : 'Not enough source data';
  }

  function makeExploreUrl(item) {
    return `https://trends.google.com/trends/explore?date=now%207-d&geo=${encodeURIComponent(state.geo)}&q=${encodeURIComponent(item.query || '')}`;
  }
  function makeSearchUrl(item) { return `https://www.google.com/search?q=${encodeURIComponent(item.query || '')}`; }

  async function loadSnapshot({ quiet = false } = {}) {
    state.loadError = false;
    if (!quiet) {
      $('trend-list').innerHTML = '<div class="loading-state"><span class="spinner"></span> Loading latest saved snapshot…</div>';
      $('empty-state').hidden = true;
    }
    $('reload-button').disabled = true;
    $('reload-button').style.opacity = '.65';
    const file = `./data/trends-${state.geo}.json?cacheBust=${Date.now()}`;
    try {
      const response = await fetch(file, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw new Error(`Snapshot file unavailable (HTTP ${response.status}).`);
      const payload = await response.json();
      if (!Array.isArray(payload.items)) throw new Error('Snapshot data format is invalid.');
      const cleanedItems = payload.items.filter((item) => item && String(item.query || item.title || '').trim());
      state.payload = payload;
      state.demo = Boolean(payload.demo) || payload.is_live_data === false;
      state.loadedAt = payload.last_checked_at || payload.snapshot_at || payload.generated_at || null;
      state.items = cleanedItems.map((item) => ({
        ...item,
        query: String(item.query || item.title).trim(),
        description: String(item.description || ''),
        news: Array.isArray(item.news) ? item.news : [],
        categories: Array.isArray(item.categories) ? item.categories : [],
        feed_position: Number(item.feed_position ?? item.source_position) || undefined,
        previous_feed_position: item.previous_feed_position ?? item.previous_position ?? item.previous_rank ?? null,
        previous_search_volume_label: item.previous_search_volume_label || null,
        traffic_bucket_change: ['up', 'down', 'same'].includes(item.traffic_bucket_change) ? item.traffic_bucket_change : null,
        consecutive_snapshots: Math.max(1, Number(item.consecutive_snapshots) || 1),
        first_observed_snapshot_at: item.first_observed_snapshot_at || null
      }));
      calculateScores(state.items);
      // Drop saved topics that aren't in this snapshot? No: keep cross-refresh bookmarks.
      state.compared = new Set([...state.compared].filter((query) => state.items.some((item) => item.query === query)).slice(0, 3));
      state.lastLoadSucceeded = true;
      $('demo-banner').hidden = !state.demo;
      $('notice-banner').hidden = true;
      $('source-link').href = `https://trends.google.com/trending?geo=${encodeURIComponent(state.geo)}`;
      $('freshness-strip').classList.toggle('is-demo', state.demo);
      updateFreshness();
      updateCategoryFilter();
      populateStudioTopics();
      renderDashboard();
    } catch (error) {
      state.loadError = true;
      state.lastLoadSucceeded = false;
      if (!quiet || !state.payload || state.payload.geo !== state.geo) {
        state.items = [];
        state.loadedAt = null;
        state.payload = null;
        state.demo = false;
      }
      $('demo-banner').hidden = true;
      if (!quiet) showNotice(`Could not read the ${GEO[state.geo]?.name || state.geo} snapshot: ${error.message} The static site cannot fetch a server-side RSS feed by itself. Check that GitHub Actions completed successfully.`);
      updateFreshness();
      updateCategoryFilter();
      populateStudioTopics();
      renderDashboard();
    } finally {
      $('reload-button').disabled = false;
      $('reload-button').style.opacity = '1';
      $('reload-button').innerHTML = '<span class="reload-icon">↻</span> Check latest snapshot';
    }
  }

  function showNotice(message) {
    $('notice-banner').textContent = message;
    $('notice-banner').hidden = false;
  }

  function updateFreshness() {
    const target = $('freshness-text');
    const strip = $('freshness-strip');
    const pill = $('source-status');
    if (state.loadError && !state.payload) {
      target.textContent = 'Snapshot unavailable · live feed has not been loaded';
      strip.classList.add('is-stale');
      pill.innerHTML = '<span class="status-dot"></span> DATA UNAVAILABLE';
      $('snapshot-time').textContent = 'Last successful fetch unknown';
      return;
    }
    if (state.demo) {
      target.textContent = 'No live snapshot yet · run the GitHub Actions workflow to fetch real Google Trends RSS';
      strip.classList.add('is-stale');
      pill.innerHTML = '<span class="status-dot"></span> NO LIVE DATA';
      $('snapshot-time').textContent = 'No live snapshot loaded';
      return;
    }
    const minutes = snapshotAgeMinutes(state.loadedAt);
    strip.classList.remove('is-stale', 'is-aging');
    pill.innerHTML = '<span class="status-dot"></span> GOOGLE TRENDS RSS';
    if (minutes === null) {
      target.textContent = 'Data file does not expose a reliable fetch timestamp';
      strip.classList.add('is-stale');
      $('snapshot-time').textContent = 'Last successful fetch unknown';
      return;
    }
    if (minutes > 60) strip.classList.add('is-stale');
    else if (minutes > 25) strip.classList.add('is-aging');
    const quality = minutes <= 25 ? 'Recent snapshot' : minutes <= 60 ? 'Snapshot may be delayed' : 'Stale snapshot';
    target.textContent = `${quality} · last successful fetch ${relativeMinutes(minutes)} · scheduled refresh about every 10 minutes (GitHub may delay runs)`;
    $('snapshot-time').textContent = `Last successful fetch ${formatDate(state.loadedAt)}`;
  }

  function updateCategoryFilter() {
    const select = $('category-select');
    const before = select.value || 'all';
    const counts = new Map();
    state.items.forEach((item) => counts.set(item._category, (counts.get(item._category) || 0) + 1));
    const ordered = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="all">All categories</option>' + ordered.map((name) => `<option value="${safeText(name)}">${safeText(name)}</option>`).join('');
    select.value = counts.has(before) ? before : 'all';
  }

  function renderDashboard() {
    const counts = new Map();
    state.items.forEach((item) => counts.set(item._category, (counts.get(item._category) || 0) + 1));
    const sortedCats = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const leaders = [...state.items].filter((item) => Number.isFinite(item._score)).sort((a, b) => scoreValue(b) - scoreValue(a));
    const volumeLeader = [...state.items].filter((item) => item._volume > 0).sort((a, b) => b._volume - a._volume)[0];
    const newCount = state.items.filter((item) => item.new_in_snapshot === true).length;
    $('metric-total').textContent = state.items.length.toLocaleString();
    $('metric-hot').textContent = leaders.filter((item) => item._score >= 75).length.toLocaleString();
    $('metric-category').textContent = sortedCats[0]?.[0] || '—';
    $('metric-category-caption').textContent = sortedCats[0] ? `${sortedCats[0][1]} of ${state.items.length} topics · inferred locally` : 'No category evidence';
    $('metric-volume').textContent = volumeLeader ? formatVolume(volumeLeader) : 'Not reported';
    $('metric-volume-caption').textContent = volumeLeader ? `Reported bucket for “${volumeLeader.query}”` : 'The RSS feed supplied no usable traffic labels';
    renderBrief(sortedCats, leaders[0], volumeLeader, newCount);
    renderCategoryChart(sortedCats);
    renderOpportunities();
    renderWatchlist();
    renderComparePanel();
    renderTrendRows(state.filtered.length ? state.filtered : state.items);
    applyFilters();
    updateFreshness();
  }

  function renderBrief(sortedCats, top, volumeLeader, newCount) {
    const target = $('brief-content');
    if (!state.items.length) {
      target.innerHTML = '<p>No actual trend rows are available. Do not use placeholder rows as current information. Run the repository workflow and check its logs.</p>';
      return;
    }
    const mainCategory = sortedCats[0];
    const lines = [];
    if (mainCategory) lines.push(`The most common locally inferred category is <strong>${safeText(mainCategory[0])}</strong> (${mainCategory[1]} of ${state.items.length} topics). This describes the feed mix, not audience share.`);
    if (top) lines.push(`The local opportunity model highlights <strong>${safeText(top.query)}</strong> (${top._score}/100) using only signals available in this feed${top._volume ? `, including its reported traffic bucket ${safeText(formatVolume(top))}` : ''}${top._age !== null ? ' and RSS timestamp recency' : ''}. This is not a Google rank, growth rate or prediction.`);
    if (volumeLeader) lines.push(`Highest traffic label in this feed: <strong>${safeText(volumeLeader.query)}</strong> at <strong>${safeText(formatVolume(volumeLeader))}</strong>. Google reports approximate/bucketed traffic, not exact counts.`);
    if (newCount) lines.push(`<strong>${newCount} topic${newCount === 1 ? '' : 's'}</strong> appeared in this snapshot but were absent from the immediately previous saved snapshot. That does not prove they began trending just now.`);
    else if (state.payload?.comparison_available) lines.push('No topics are marked new against the immediately previous saved snapshot. Feed-position/appearance comparisons only cover consecutive snapshots retained by this repository.');
    else lines.push('No prior saved snapshot is available for comparison yet.');
    if (state.payload?.comparison_available) {
      const up = state.items.filter((item) => item.traffic_bucket_change === 'up').length;
      const down = state.items.filter((item) => item.traffic_bucket_change === 'down').length;
      const same = state.items.filter((item) => item.traffic_bucket_change === 'same').length;
      lines.push(`Since the previous snapshot, <strong>${up}</strong> approximate traffic bucket(s) moved up, <strong>${down}</strong> moved down, and <strong>${same}</strong> stayed in the same bucket. These are coarse bucket changes, not percentage growth.`);
      const persistent = [...state.items].sort((a, b) => b.consecutive_snapshots - a.consecutive_snapshots)[0];
      if (persistent && persistent.consecutive_snapshots > 1) lines.push(`<strong>${safeText(persistent.query)}</strong> has appeared in ${persistent.consecutive_snapshots} consecutive successful snapshot(s). This is a feed-observation streak, not continuous search-volume measurement.`);
    }
    if (state.loadedAt) lines.push(`Data capture timestamp: <strong>${safeText(formatDate(state.loadedAt))}</strong>. Per-item RSS timestamps are shown separately as supplied by the feed.`);
    target.innerHTML = lines.map((line) => `<div class="brief-bullet">${line}</div>`).join('');
  }

  function renderCategoryChart(sortedCats) {
    const target = $('category-chart');
    if (!sortedCats.length || !state.items.length) {
      target.innerHTML = '<div class="empty-mini">Category distribution will appear when feed data is available.</div>';
      return;
    }
    const top = sortedCats.slice(0, 6);
    target.innerHTML = top.map(([name, count]) => {
      const color = CATEGORY_COLORS[name] || CATEGORY_COLORS.Other;
      const percent = count / state.items.length * 100;
      return `<div class="category-line"><span class="category-name">${safeText(name)}</span><div class="category-track" title="${percent.toFixed(1)}% of loaded topics"><div class="category-fill" style="width:${Math.max(percent, 1)}%;background:${color}"></div></div><span class="category-count">${count}</span></div>`;
    }).join('');
  }

  function ideaFor(item) {
    const ideas = {
      Sports: 'Explain the confirmed result or event, key context, and what viewers should watch next. Verify the score and teams before publishing.',
      Entertainment: 'Give viewers the context: who or what is trending, confirmed release details, and why audiences may be searching.',
      Technology: 'Explain what changed, who is affected, core features, availability, and practical next steps. Separate official specs from rumours.',
      Politics: 'Use a neutral explainer with sourced facts, policy background, multiple perspectives, and a clear distinction between claims and confirmed events.',
      Finance: 'Explain the event and its context, provide sources and risk disclaimers, and avoid unsupported price predictions or personalised financial advice.',
      Business: 'Break down the company or product angle, customer impact, competitors, and what is known versus speculation.',
      Weather: 'Use official meteorological sources for current conditions and safety advice. Do not infer a forecast from search interest.',
      Education: 'Summarise eligibility, official dates, steps, and source links. Double-check the relevant education board or recruitment authority.',
      Lifestyle: 'Create a practical guide, checklist or audience Q&A; verify medical, legal, and safety claims with authoritative sources.',
      Other: 'Start with what is confirmed, who it affects, and why it matters. Search for reliable reporting before making a strong claim.'
    };
    return ideas[item._category] || ideas.Other;
  }

  function renderOpportunities() {
    const target = $('opportunity-content');
    if (!state.items.length) {
      target.innerHTML = '<div class="empty-mini">Content suggestions require a real trend snapshot.</div>';
      return;
    }
    const list = [...state.items].sort((a, b) => scoreValue(b) - scoreValue(a) || a._position - b._position).slice(0, 4);
    target.innerHTML = list.map((item, index) => `<div class="opportunity-item"><span class="opportunity-num">0${index + 1}</span><div class="opportunity-copy"><strong>${safeText(item.query)}</strong><p>${safeText(ideaFor(item))}</p><button class="text-action" type="button" data-studio-pick="${safeText(item.query)}">Build content plan ↗</button></div><span class="opportunity-score">${safeText(scoreDisplay(item))}</span></div>`).join('');
  }

  function applyFilters() {
    const term = $('search-input').value.trim().toLowerCase();
    const category = $('category-select').value;
    const sort = $('sort-select').value;
    let list = state.items.filter((item) => {
      const text = `${item.query} ${item.description} ${item._category}`.toLowerCase();
      return (!term || text.includes(term)) && (category === 'all' || item._category === category);
    });
    if (sort === 'volume') list.sort((a, b) => b._volume - a._volume || a._position - b._position);
    else if (sort === 'recent') list.sort((a, b) => (a._age ?? Infinity) - (b._age ?? Infinity));
    else if (sort === 'az') list.sort((a, b) => a.query.localeCompare(b.query));
    else if (sort === 'position') list.sort((a, b) => a._position - b._position);
    else list.sort((a, b) => scoreValue(b) - scoreValue(a) || a._position - b._position);
    state.filtered = list;
    renderTrendRows(list);
  }

  function renderTrendRows(items) {
    const target = $('trend-list');
    $('results-count').textContent = items.length;
    $('empty-state').hidden = items.length !== 0;
    target.hidden = items.length === 0;
    if (!items.length) {
      target.innerHTML = '';
      $('list-footer-text').textContent = state.items.length ? 'No topics match the current filters.' : 'No live trend data is available in this snapshot.';
      return;
    }
    target.innerHTML = items.map((item, index) => {
      const category = item._category || 'Other';
      const safeCategoryClass = category.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const scoreClass = Number.isFinite(item._score) && item._score >= 75 ? 'high' : Number.isFinite(item._score) && item._score >= 50 ? 'medium' : '';
      const expanded = state.expanded.has(item.query);
      const watching = state.watched.has(item.query);
      const comparing = state.compared.has(item.query);
      const description = item.description ? `<div class="topic-description">${safeText(item.description)}</div>` : '';
      const bucketBadge = trafficChangeBadge(item);
      const seenBadge = item.consecutive_snapshots > 1 ? `<span class="change-chip seen-chip">SEEN ${item.consecutive_snapshots} CHECKS</span>` : '';
      const volumeNote = item._volume > 0 ? 'Google approximate bucket' : 'Not reported in RSS';
      const timeNote = item.pub_date ? relativeAge(item._age) : 'Not provided';
      let changeText = state.payload?.comparison_available ? 'No earlier position for this topic' : 'No prior snapshot comparison';
      if (item.new_in_snapshot === true) changeText = 'New in this snapshot';
      else if (item._move !== null) changeText = item._move !== 0 ? `Feed position ${item._position - item._move} → ${item._position} vs prior snapshot` : 'Same feed position vs prior snapshot';
      const news = item.news.slice(0, 3).map((entry) => {
        const url = safeUrl(entry.url, '');
        const title = entry.title || entry.source || 'Related article';
        return url ? `<a class="detail-link" href="${safeText(url)}" target="_blank" rel="noopener noreferrer">${safeText(title)} ↗</a>` : `<span>${safeText(title)}</span>`;
      }).join('');
      const details = expanded ? `<div class="trend-detail"><div class="detail-insight"><strong>What this signal means</strong><div>${safeText(ideaFor(item))}</div></div><div class="detail-facts"><span><b>Feed position</b> #${item._position}</span><span><b>Traffic label</b> ${safeText(formatVolume(item))}</span><span><b>Traffic bucket change</b> ${safeText(trafficBucketSummary(item))}</span><span><b>Consecutive snapshots observed</b> ${item.consecutive_snapshots}</span><span><b>First observed by this dashboard</b> ${safeText(item.first_observed_snapshot_at ? formatDate(item.first_observed_snapshot_at) : 'Not recorded')}</span><span><b>RSS timestamp</b> ${safeText(item.pub_date ? formatDate(item.pub_date) : 'Not supplied')}</span><span><b>Snapshot comparison</b> ${safeText(changeText)}</span></div>${item.description ? `<div class="detail-description">${safeText(item.description)}</div>` : ''}${news ? `<div class="related-news"><strong>Related coverage in RSS (verify source)</strong>${news}</div>` : ''}<div class="detail-actions"><a class="detail-link" href="${makeExploreUrl(item)}" target="_blank" rel="noopener noreferrer">Explore search interest ↗</a><a class="detail-link" href="${makeSearchUrl(item)}" target="_blank" rel="noopener noreferrer">Search web ↗</a><button class="detail-copy" type="button" data-copy="${safeText(item.query)}">Copy topic ⧉</button><button class="detail-copy" type="button" data-studio-pick="${safeText(item.query)}">Build content plan ✳</button></div></div>` : '';
      return `<article class="trend-row"><div class="topic-cell"><span class="rank-chip" title="RSS feed position, not a Google ranking">RSS #${String(item._position || index + 1).padStart(2, '0')}</span><div class="topic-copy"><div class="topic-title">${safeText(item.query)}</div>${description}${item.new_in_snapshot === true ? '<span class="change-chip">NEW IN SNAPSHOT</span>' : ''}${bucketBadge}${seenBadge}</div></div><span class="category-badge cat-${safeCategoryClass}">${safeText(category)} <small>est.</small></span><div class="volume-cell"><div class="volume-main">${safeText(formatVolume(item))}</div><div class="volume-note">${volumeNote}</div></div><span class="started-text" title="Timestamp as supplied in the Google Trends RSS feed">${safeText(timeNote)}</span><div class="score-wrap"><div class="score-label"><span>${Number.isFinite(item._score) ? item._score : '—'}</span><small>OPPORTUNITY SCORE</small></div><div class="score-track"><div class="score-fill ${scoreClass}" style="width:${Number.isFinite(item._score) ? item._score : 0}%"></div></div><div class="movement-note">${item.traffic_bucket_change === 'up' ? 'Traffic bucket ↑' : item.traffic_bucket_change === 'down' ? 'Traffic bucket ↓' : item.new_in_snapshot === true ? 'New in snapshot' : item._move === null ? 'No prior comparison' : item._move !== 0 ? `Feed position ${item._position - item._move} → ${item._position}` : 'Same feed position'}</div></div><div class="row-actions"><button class="row-more" type="button" data-watch="${safeText(item.query)}" aria-pressed="${watching}" title="${watching ? 'Remove from saved topics' : 'Save topic'}">${watching ? '★' : '☆'}</button><button class="row-more compare-toggle" type="button" data-compare="${safeText(item.query)}" aria-pressed="${comparing}" title="${comparing ? 'Remove from compare' : 'Compare topic'}">${comparing ? '✓' : '+'}</button><button class="row-more" type="button" data-expand="${safeText(item.query)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Hide' : 'Show'} insight for ${safeText(item.query)}">${expanded ? '×' : '···'}</button></div>${details}</article>`;
    }).join('');
    $('list-footer-text').textContent = `Showing ${items.length} of ${state.items.length} loaded RSS topics · Google RSS can contain fewer rows than the full Trending Now page`;
  }

  function toggleWatch(query) {
    if (state.watched.has(query)) state.watched.delete(query); else state.watched.add(query);
    saveLocalSet('trendscope-watchlist', state.watched);
    renderTrendRows(state.filtered);
    renderWatchlist();
  }

  function toggleCompare(query) {
    if (state.compared.has(query)) state.compared.delete(query);
    else {
      if (state.compared.size >= 3) {
        showNotice('Compare supports up to three topics at a time. Remove one topic before adding another.');
        return;
      }
      state.compared.add(query);
    }
    renderTrendRows(state.filtered);
    renderComparePanel();
  }

  function renderComparePanel() {
    const target = $('compare-panel');
    const items = [...state.compared].map((query) => state.items.find((item) => item.query === query)).filter(Boolean);
    target.hidden = items.length === 0;
    if (!items.length) { target.innerHTML = ''; return; }
    target.innerHTML = `<div class="compare-heading"><div><strong>Topic comparison</strong><span>Compare fields currently available from the RSS snapshot</span></div><button class="detail-copy" type="button" id="clear-compare">Clear comparison</button></div><div class="compare-grid">${items.map((item) => `<div class="compare-card"><strong>${safeText(item.query)}</strong><span>${safeText(item._category)} · estimated category</span><div class="compare-metric"><small>RSS feed position</small><b>#${item._position}</b></div><div class="compare-metric"><small>Reported traffic</small><b>${safeText(formatVolume(item))}</b></div><div class="compare-metric"><small>Bucket change</small><b>${safeText(item.traffic_bucket_change || 'No comparison')}</b></div><div class="compare-metric"><small>Local opportunity score</small><b>${safeText(scoreDisplay(item))}</b></div><a class="detail-link" href="${makeExploreUrl(item)}" target="_blank" rel="noopener noreferrer">Open Trends ↗</a></div>`).join('')}</div><p class="compare-note">These fields are not apples-to-apples search-interest time series. Use Google Trends Explore for deeper comparison; traffic labels are approximate buckets.</p>`;
  }

  function renderWatchlist() {
    const target = $('watchlist-content');
    if (!state.watched.size) {
      target.innerHTML = '<div class="empty-mini">Use the star beside any topic to save it. Saved names remain in this browser between visits.</div>';
      return;
    }
    const saved = [...state.watched].map((query) => state.items.find((item) => item.query === query) || { query, _missing: true });
    target.innerHTML = saved.map((item) => `<div class="watch-item"><div><strong>${safeText(item.query)}</strong><small>${item._missing ? 'Not in the current snapshot' : `${safeText(item._category)} · ${safeText(formatVolume(item))}`}</small></div><div class="watch-actions">${!item._missing ? `<button class="text-action" type="button" data-studio-pick="${safeText(item.query)}">Plan</button>` : ''}<button class="text-action" type="button" data-watch="${safeText(item.query)}">Remove</button></div></div>`).join('');
  }

  function populateStudioTopics() {
    const select = $('studio-trend-select');
    const previous = select.value;
    if (!state.items.length) {
      select.innerHTML = '<option value="">No trend data available</option>';
      return;
    }
    const sorted = [...state.items].sort((a, b) => scoreValue(b) - scoreValue(a));
    select.innerHTML = sorted.map((item) => `<option value="${safeText(item.query)}">${safeText(item.query)}</option>`).join('');
    if (sorted.some((item) => item.query === previous)) select.value = previous;
    else select.value = sorted[0].query;
  }

  function answerAnalyst(question) {
    const q = String(question || '').trim().toLowerCase();
    if (!state.items.length) return { title: 'No data to analyze yet', paragraphs: ['This snapshot contains no real trend rows. Run GitHub Actions to fetch the feed before drawing conclusions.'] };
    const freshness = snapshotAgeMinutes(state.loadedAt);
    const freshWarning = freshness !== null && freshness > 60 ? `The loaded snapshot is ${relativeMinutes(freshness)} old, so treat recommendations as stale until the workflow succeeds.` : '';
    const highestVolume = [...state.items].filter((item) => item._volume > 0).sort((a, b) => b._volume - a._volume)[0];
    const priority = [...state.items].sort((a, b) => scoreValue(b) - scoreValue(a))[0];
    const newItems = state.items.filter((item) => item.new_in_snapshot === true);
    const catCounts = new Map();
    state.items.forEach((item) => catCounts.set(item._category, (catCounts.get(item._category) || 0) + 1));
    const topCats = [...catCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let answer;
    if (/bucket|traffic shift|traffic changed|volume changed|increas|decreas|moving up|moving down/.test(q)) {
      const upItems = state.items.filter((item) => item.traffic_bucket_change === 'up');
      const downItems = state.items.filter((item) => item.traffic_bucket_change === 'down');
      const sameItems = state.items.filter((item) => item.traffic_bucket_change === 'same');
      answer = state.payload?.comparison_available
        ? { title: 'Approximate traffic-bucket changes since the previous snapshot', paragraphs: [
          `${upItems.length} bucket(s) moved up, ${downItems.length} moved down, and ${sameItems.length} stayed the same.`,
          ...upItems.slice(0, 5).map((item) => `${item.query}: ${trafficBucketSummary(item)}.`),
          ...downItems.slice(0, 5).map((item) => `${item.query}: ${trafficBucketSummary(item)}.`),
          'Traffic labels are coarse estimates. A bucket shift is not an exact count, growth percentage, or proof of cause.'
        ] }
        : { title: 'No previous snapshot to compare', paragraphs: ['Traffic bucket direction becomes available after a second successful snapshot for the selected region.', 'Reported traffic labels themselves remain approximate buckets, not exact counts.'] };
    } else if (/new|just appeared|changed|snapshot diff/.test(q)) {
      answer = { title: 'Topics new in the latest saved snapshot', paragraphs: [newItems.length ? `${newItems.length} topic(s) are absent from the previous saved snapshot: ${newItems.slice(0, 6).map((item) => item.query).join('; ')}.` : 'No topics are flagged as newly appearing versus the previous saved snapshot.', 'This compares consecutive repository snapshots. It does not establish the exact time that Google search interest started increasing.'] };
    } else if (/volume|traffic|most searched|popular/.test(q)) {
      answer = { title: 'Highest reported traffic label', paragraphs: [highestVolume ? `${highestVolume.query} has the largest numeric lower-bound extracted from the reported Google traffic label (${formatVolume(highestVolume)}).` : 'No usable approximate traffic labels were included in the loaded RSS items.', 'These are approximate / bucketed RSS labels, not exact search counts or audience size.'] };
    } else if (/categor|topic mix|summari[sz]e|overview|pattern/.test(q)) {
      answer = { title: 'Category mix from local classification', paragraphs: [topCats.map(([name, count]) => `${name}: ${count} topic(s)`).join(' · ') || 'No categories found.', 'Categories are inferred from query wording, not assigned by Google in the RSS feed. This describes the small loaded feed, not all searches in the country.'] };
    } else if (/compare/.test(q) && state.compared.size >= 2) {
      const selected = [...state.compared].map((query) => state.items.find((item) => item.query === query)).filter(Boolean);
      answer = { title: 'Selected topic comparison', paragraphs: selected.map((item) => `${item.query}: RSS feed position #${item._position}; traffic ${formatVolume(item)}; local opportunity score ${scoreDisplay(item)}.`).concat('RSS feed position is list order, not a volume rank. The feed does not provide comparable history curves; open Google Trends Explore for a deeper comparison.') };
    } else if (/youtube|video|cover|content|recommend|best|today|what should|idea/.test(q)) {
      const picks = [...state.items].sort((a, b) => scoreValue(b) - scoreValue(a)).slice(0, 3);
      answer = { title: 'Suggested content opportunities', paragraphs: picks.map((item, i) => `${i + 1}. ${item.query} — ${ideaFor(item)} (local opportunity score ${scoreDisplay(item)}).`), action: picks[0]?.query };
    } else {
      const search = state.items.filter((item) => item.query.toLowerCase().includes(q) || item._category.toLowerCase().includes(q)).slice(0, 5);
      answer = search.length
        ? { title: `Matches for “${question}”`, paragraphs: search.map((item) => `${item.query} — ${item._category}; traffic ${formatVolume(item)}; local opportunity score ${scoreDisplay(item)}.`) }
        : { title: 'Here is how I can help with this snapshot', paragraphs: [`Loaded ${state.items.length} trend topics for ${GEO[state.geo].name}. Try asking which topic has the highest traffic, what to cover today, what changed, or for a category summary.`] };
    }
    if (freshWarning) answer.paragraphs.push(freshWarning);
    return answer;
  }

  function runAnalyst(questionOverride) {
    const question = (questionOverride ?? $('analyst-question').value).trim();
    if (!question) { $('analyst-question').focus(); return; }
    $('analyst-question').value = question;
    const answer = answerAnalyst(question);
    $('analyst-answer').innerHTML = `<strong>${safeText(answer.title)}</strong>${answer.paragraphs.map((paragraph) => `<p>${safeText(paragraph)}</p>`).join('')}${answer.action ? `<button class="text-action" type="button" data-studio-pick="${safeText(answer.action)}">Create a plan for “${safeText(answer.action)}” ↗</button>` : ''}`;
  }

  const CONTENT_TEMPLATES = {
    English: {
      hook: (topic) => `“${topic} is getting attention — here is what we know, what is still unclear, and why it matters.”`,
      titles: (topic) => [`${topic}: What Happened and Why People Are Searching`, `The Important Facts About ${topic}`, `${topic} Explained: Key Context in Plain English`],
      outline: ['Open with the confirmed event and date.', 'Explain the key context and who is affected.', 'Separate verified facts from speculation.', 'Answer the audience’s most likely question.', 'End with a practical takeaway and source links.'],
      cta: 'Ask viewers what they want verified next, and include reputable sources in the description.'
    },
    Bengali: {
      hook: (topic) => `“${topic} নিয়ে হঠাৎ এত আলোচনা কেন? কী জানা গেছে, কী এখনও নিশ্চিত নয়—সহজ ভাষায় দেখে নিন।”`,
      titles: (topic) => [`${topic}: আসল ঘটনা কী? সম্পূর্ণ ব্যাখ্যা`, `${topic} নিয়ে যে তথ্যগুলি জানা জরুরি`, `${topic}: কী জানা গেছে, কী এখনও অজানা?`],
      outline: ['শুরুতেই নিশ্চিত ঘটনা ও তারিখ বলুন।', 'বিষয়টির পেছনের প্রেক্ষাপট সহজ বাংলায় ব্যাখ্যা করুন।', 'যাচাই করা তথ্য ও গুজব আলাদা করুন।', 'দর্শকের সবচেয়ে গুরুত্বপূর্ণ প্রশ্নের উত্তর দিন।', 'বিশ্বস্ত সূত্র দেখিয়ে সংক্ষিপ্ত উপসংহার দিন।'],
      cta: 'দর্শকদের প্রশ্ন করতে বলুন এবং বিবরণে নির্ভরযোগ্য সূত্রের লিঙ্ক দিন।'
    },
    Hindi: {
      hook: (topic) => `“${topic} पर अचानक इतनी चर्चा क्यों है? जानिए क्या पुष्टि हुई है, क्या अभी स्पष्ट नहीं है, और यह क्यों महत्वपूर्ण है।”`,
      titles: (topic) => [`${topic}: क्या हुआ और लोग क्यों खोज रहे हैं?`, `${topic} के बारे में जरूरी तथ्य`, `${topic} की आसान भाषा में पूरी व्याख्या`],
      outline: ['पुष्टि की गई घटना और तारीख से शुरुआत करें।', 'जरूरी पृष्ठभूमि और प्रभावित लोगों को समझाएं।', 'तथ्यों और अटकलों को अलग रखें।', 'दर्शकों के मुख्य सवाल का जवाब दें।', 'विश्वसनीय स्रोत और व्यावहारिक निष्कर्ष दें।'],
      cta: 'दर्शकों से अगला सवाल पूछने को कहें और विवरण में विश्वसनीय स्रोत जोड़ें।'
    }
  };

  function generateContentPlan() {
    const query = $('studio-trend-select').value;
    const item = state.items.find((entry) => entry.query === query);
    const target = $('studio-output');
    if (!item) {
      target.innerHTML = '<div class="empty-mini">A real trend topic is required. Refresh the saved snapshot first.</div>';
      return;
    }
    const audience = $('studio-audience').value;
    const format = $('studio-format').value;
    const language = $('studio-language').value;
    const t = CONTENT_TEMPLATES[language] || CONTENT_TEMPLATES.English;
    const audienceName = {
      general: 'a broad general audience', youtube: 'YouTube viewers', bengali: 'Bengali-speaking viewers',
      students: 'students and job seekers', business: 'business owners and marketers', readers: 'search-driven blog readers'
    }[audience];
    const formatName = { youtube: 'YouTube video', short: 'Short / Reel', article: 'SEO article', social: 'Facebook / Instagram post', explainer: 'neutral explainer' }[format];
    let lengths;
    if (format === 'short') lengths = ['0–3 seconds: state the verified hook.', '3–15 seconds: give one key piece of context.', '15–30 seconds: explain why it matters.', 'Final seconds: invite one focused audience question.'];
    else if (format === 'article') lengths = ['Headline and concise answer to the main question.', 'Background and timeline using verified dates.', 'What is confirmed / what remains unknown.', 'Impact, next steps and links to primary sources.'];
    else if (format === 'social') lengths = ['First line: clear factual hook, no exaggerated promise.', 'Two or three short context lines.', 'One direct question that invites meaningful comments.', 'Add source link and only relevant hashtags.'];
    else if (format === 'explainer') lengths = ['What happened: confirm event and date.', 'What credible sources say.', 'Relevant background and implications.', 'What remains uncertain and where to follow updates.'];
    else lengths = t.outline;

    const hashtags = makeHashtags(item, language, format);
    const titles = t.titles(item.query);
    const scoreExplanation = `The local opportunity score is ${scoreDisplay(item)}. It uses the relative reported traffic bucket, RSS timestamp recency, and the previous-snapshot bucket direction when available. RSS list position is not used. The bucket shift is coarse—not an exact growth percentage, Google rank or prediction.`;
    const disclosure = 'Editorial safety check: this feed alone does not verify what happened. Confirm the story through primary or reputable sources before publishing; do not invent causes, quotes, numbers or outcomes.';
    target.innerHTML = `<div class="content-plan"><div class="plan-meta"><span>${safeText(formatName)}</span><span>${safeText(language)}</span><span>For ${safeText(audienceName)}</span></div><div class="plan-section"><small>CONTENT ANGLE</small><p>${safeText(ideaFor(item))}</p></div><div class="plan-section"><small>HOOK / OPENING</small><p>${safeText(t.hook(item.query))}</p><button class="text-action" type="button" data-copy="${safeText(t.hook(item.query))}">Copy hook ⧉</button></div><div class="plan-section"><small>3 TITLE OPTIONS</small><ol>${titles.map((title) => `<li>${safeText(title)}</li>`).join('')}</ol></div><div class="plan-section"><small>RECOMMENDED STRUCTURE</small><ol>${lengths.map((line) => `<li>${safeText(line)}</li>`).join('')}</ol></div><div class="plan-section"><small>CALL TO ACTION</small><p>${safeText(t.cta)}</p></div><div class="plan-section"><small>HASHTAG IDEAS</small><p class="hashtag-row">${hashtags.map((tag) => `<span>${safeText(tag)}</span>`).join(' ')}</p></div><div class="plan-score"><span><b>Snapshot context</b>${safeText(item._category)} · traffic ${safeText(formatVolume(item))} · RSS feed position #${item._position}</span><span>${safeText(scoreExplanation)}</span></div><div class="editorial-warning">${safeText(disclosure)}</div><div class="plan-actions"><button class="button button-quiet" id="copy-plan" type="button">Copy plan</button><button class="button button-outline" id="download-plan" type="button">Download TXT</button></div></div>`;
    state.currentPlanText = plainContentPlan(item, t, titles, lengths, hashtags, formatName, audienceName, language, scoreExplanation, disclosure);
  }

  function makeHashtags(item, language, format) {
    const topicWords = item.query.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2).slice(0, 3);
    const base = language === 'Bengali' ? ['ট্রেন্ডিং', 'বাংলা আপডেট'] : language === 'Hindi' ? ['ट्रेंडिंग', 'जानकारी'] : ['Trending', 'Explained'];
    if (format === 'youtube') base.push('YouTube');
    return [...new Set([...topicWords.map((word) => `#${word}`), ...base.map((word) => `#${word.replace(/\s+/g, '')}`)])].slice(0, 7);
  }

  function plainContentPlan(item, t, titles, lengths, hashtags, formatName, audienceName, language, scoreExplanation, disclosure) {
    return [
      `TREND: ${item.query}`, `FORMAT: ${formatName}`, `LANGUAGE: ${language}`, `AUDIENCE: ${audienceName}`,
      '', 'CONTENT ANGLE', ideaFor(item), '', 'HOOK', t.hook(item.query), '', 'TITLE OPTIONS', ...titles.map((value, i) => `${i + 1}. ${value}`),
      '', 'STRUCTURE', ...lengths.map((value, i) => `${i + 1}. ${value}`), '', 'CTA', t.cta, '', 'HASHTAGS', hashtags.join(' '),
      '', 'SNAPSHOT CONTEXT', `${item._category} · traffic ${formatVolume(item)} · ${trafficBucketSummary(item)} · appears in ${item.consecutive_snapshots} consecutive snapshot(s) · local opportunity score ${scoreDisplay(item)}`, 
      scoreExplanation, '', disclosure
    ].join('\n');
  }

  function exportJson() {
    const payload = {
      export_generated_at: new Date().toISOString(),
      geo: state.geo,
      country: GEO[state.geo]?.name || state.geo,
      source: state.payload?.source || 'Google Trends Trending Now RSS',
      snapshot_at: state.payload?.snapshot_at || null,
      last_checked_at: state.payload?.last_checked_at || null,
      comparison_available: Boolean(state.payload?.comparison_available),
      is_live_data: Boolean(state.payload?.is_live_data && !state.demo),
      applied_filters: {
        search: $('search-input').value.trim(),
        category: $('category-select').value,
        sort: $('sort-select').value
      },
      interpretation_notes: [
        'RSS feed position is list order, not an official search-volume or relevance rank.',
        'Reported traffic labels are approximate buckets; numeric values are lower-bound approximations.',
        'Traffic bucket direction compares only adjacent successful snapshots and is not an exact growth percentage.',
        'Estimated category and local opportunity score are heuristic, snapshot-relative, and are not official Google metrics. The score is omitted when no usable scoring signals are available.',
        'An empty dataset is not replaced with fabricated sample trends.'
      ],
      items: state.filtered.map((item) => ({
        query: item.query,
        estimated_category: item._category,
        category_source: item.category_source || 'local_keyword_inference',
        reported_traffic_label: formatVolume(item),
        traffic_numeric_lower_bound_approx: item._volume || null,
        rss_timestamp_as_provided: item.pub_date || null,
        rss_feed_position_not_rank: item._position,
        previous_rss_feed_position: item.previous_feed_position ?? null,
        new_in_snapshot: item.new_in_snapshot === true,
        previous_reported_traffic_label: item.previous_search_volume_label || null,
        traffic_bucket_direction_adjacent_snapshot_only: item.traffic_bucket_change || null,
        consecutive_snapshots_observed: item.consecutive_snapshots ?? null,
        first_observed_snapshot_at: item.first_observed_snapshot_at || null,
        local_opportunity_score_heuristic: item._score,
        description: item.description || '',
        related_news: Array.isArray(item.news) ? item.news : [],
        google_trends_explore_url: makeExploreUrl(item),
        google_search_url: makeSearchUrl(item)
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `trendscope-${state.geo.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const header = ['table_display_order', 'rss_feed_position_not_rank', 'query', 'estimated_category', 'category_source', 'reported_traffic_label', 'traffic_numeric_lower_bound_approx', 'rss_timestamp_as_provided', 'previous_rss_feed_position', 'new_in_snapshot', 'previous_reported_traffic_label', 'traffic_bucket_direction_adjacent_snapshot_only', 'consecutive_snapshots_observed', 'first_observed_snapshot_at', 'local_opportunity_score_heuristic', 'description', 'explore_url'];
    const rows = state.filtered.map((item, index) => [index + 1, item._position, item.query, item._category, 'local keyword inference', formatVolume(item), item._volume || '', item.pub_date || '', item.previous_feed_position ?? '', item.new_in_snapshot === true, item.previous_search_volume_label || '', item.traffic_bucket_change || '', item.consecutive_snapshots, item.first_observed_snapshot_at || '', item._score, item.description || '', makeExploreUrl(item)]);
    const csv = [header, ...rows].map((row) => row.map((value) => {
      let cell = String(value ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
      // Neutralize spreadsheet formula injection in untrusted text cells.
      if (/^[=+@\-]/.test(cell) && !/^\d/.test(cell)) cell = `'${cell}`;
      return `"${cell}"`;
    }).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `trendscope-${state.geo.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  async function copyText(value, button) {
    try {
      await navigator.clipboard.writeText(value);
      if (button) { const previous = button.textContent; button.textContent = 'Copied ✓'; window.setTimeout(() => { if (button.isConnected) button.textContent = previous; }, 1300); }
    } catch {
      const area = document.createElement('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select();
      try { document.execCommand('copy'); if (button) button.textContent = 'Copied ✓'; } catch { if (button) button.textContent = 'Copy unavailable'; }
      area.remove();
    }
  }

  function handleInteractiveClick(event) {
    const watch = event.target.closest('[data-watch]');
    if (watch) { toggleWatch(watch.dataset.watch); return; }
    const compare = event.target.closest('[data-compare]');
    if (compare) { toggleCompare(compare.dataset.compare); return; }
    const expand = event.target.closest('[data-expand]');
    if (expand) {
      const query = expand.dataset.expand;
      if (state.expanded.has(query)) state.expanded.delete(query); else state.expanded.add(query);
      renderTrendRows(state.filtered);
      return;
    }
    const pick = event.target.closest('[data-studio-pick]');
    if (pick) {
      $('studio-trend-select').value = pick.dataset.studioPick;
      $('ai-studio').scrollIntoView({ behavior: 'smooth', block: 'start' });
      generateContentPlan();
      return;
    }
    const copy = event.target.closest('[data-copy]');
    if (copy) { copyText(copy.dataset.copy, copy); return; }
    if (event.target.id === 'clear-compare') {
      state.compared.clear(); renderTrendRows(state.filtered); renderComparePanel(); return;
    }
    if (event.target.id === 'copy-plan') { copyText(state.currentPlanText || '', event.target); return; }
    if (event.target.id === 'download-plan') {
      const blob = new Blob([state.currentPlanText || ''], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `trendscope-content-plan-${state.geo.toLowerCase()}.txt`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    }
  }

  function clearFilters() {
    $('search-input').value = '';
    $('category-select').value = 'all';
    $('sort-select').value = 'opportunity';
    applyFilters();
  }

  function initTheme() {
    try { if (localStorage.getItem('trendscope-theme') === 'light') document.body.classList.add('light-theme'); } catch { /* Optional preference. */ }
    $('theme-toggle').addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      try { localStorage.setItem('trendscope-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark'); } catch { /* Optional preference. */ }
    });
  }

  $('country-select').addEventListener('change', (event) => {
    state.geo = event.target.value;
    state.expanded.clear();
    state.compared.clear();
    loadSnapshot();
  });
  $('reload-button').addEventListener('click', () => loadSnapshot());
  $('search-input').addEventListener('input', applyFilters);
  $('category-select').addEventListener('change', applyFilters);
  $('sort-select').addEventListener('change', applyFilters);
  $('export-button').addEventListener('click', exportCsv);
  $('export-json-button').addEventListener('click', exportJson);
  $('clear-filters').addEventListener('click', clearFilters);
  $('trend-list').addEventListener('click', handleInteractiveClick);
  $('opportunity-content').addEventListener('click', handleInteractiveClick);
  $('watchlist-content').addEventListener('click', handleInteractiveClick);
  $('compare-panel').addEventListener('click', handleInteractiveClick);
  $('studio-output').addEventListener('click', handleInteractiveClick);
  $('analyst-answer').addEventListener('click', handleInteractiveClick);
  $('ask-analyst').addEventListener('click', () => runAnalyst());
  $('analyst-question').addEventListener('keydown', (event) => { if (event.key === 'Enter') runAnalyst(); });
  document.querySelectorAll('[data-question]').forEach((button) => button.addEventListener('click', () => runAnalyst(button.dataset.question)));
  $('generate-content').addEventListener('click', generateContentPlan);
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault(); $('search-input').focus();
    }
    if (event.key === 'Escape' && document.activeElement === $('search-input')) $('search-input').blur();
  });
  initTheme();
  loadSnapshot();
  // The page polls the static JSON, not Google's RSS directly. Freshness still depends on workflow success.
  window.setInterval(() => loadSnapshot({ quiet: true }), 120000);
})();
