(() => {
  'use strict';

  const GEO = {
    IN: { name: 'India', flag: '🇮🇳' },
    US: { name: 'United States', flag: '🇺🇸' },
    GB: { name: 'United Kingdom', flag: '🇬🇧' },
    CA: { name: 'Canada', flag: '🇨🇦' },
    AU: { name: 'Australia', flag: '🇦🇺' }
  };

  const KEYWORDS = {
    Sports: ['cricket', 'ipl', 'football', 'soccer', 'match', 'score', 'tournament', 'world cup', 'nba', 'tennis', 'olympic', 'fifa', 'vs ', ' vs', 'league', 'player', 'team', 'wicket', 'goal', 'race', 'grand prix', 'formula 1', 'f1'],
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
    Finance: '#83e0b5', Business: '#83e0b5', Weather: '#8bdce9', Education: '#b4a7ff', Lifestyle: '#f4a3c8', Other: '#a5b2cd'
  };
  const $ = (id) => document.getElementById(id);
  const state = { geo: 'IN', items: [], filtered: [], expanded: new Set(), demo: false, loadedAt: null, loadError: false };

  function normaliseCategory(item) {
    if (Array.isArray(item.categories) && item.categories.length) {
      const first = typeof item.categories[0] === 'string' ? item.categories[0] : item.categories[0]?.name;
      if (first && first !== 'Uncategorized') return first;
    }
    const text = `${item.query || ''} ${item.description || ''}`.toLowerCase();
    for (const [category, words] of Object.entries(KEYWORDS)) {
      if (words.some((word) => word === 'ai' ? /(?:^|\W)ai(?:$|\W)/.test(text) : text.includes(word))) return category;
    }
    return 'Other';
  }

  function volumeNumber(item) {
    if (Number.isFinite(Number(item.search_volume)) && Number(item.search_volume) > 0) return Number(item.search_volume);
    const raw = String(item.search_volume_label || item.approx_traffic || '').trim().replace(/,/g, '').toUpperCase();
    const match = raw.match(/([\d.]+)\s*([KMB])?/);
    if (!match) return 0;
    const multipliers = { K: 1e3, M: 1e6, B: 1e9 };
    return Math.round(Number(match[1]) * (multipliers[match[2]] || 1));
  }

  function formatVolume(item) {
    if (item.search_volume_label && !/^not available$/i.test(item.search_volume_label)) return item.search_volume_label;
    const amount = volumeNumber(item);
    if (!amount) return 'Not available';
    if (amount >= 1e9) return `${(amount / 1e9).toFixed(amount >= 10e9 ? 0 : 1).replace(/\.0$/, '')}B+`;
    if (amount >= 1e6) return `${(amount / 1e6).toFixed(amount >= 10e6 ? 0 : 1).replace(/\.0$/, '')}M+`;
    if (amount >= 1e3) return `${(amount / 1e3).toFixed(amount >= 100e3 ? 0 : 1).replace(/\.0$/, '')}K+`;
    return `${amount.toLocaleString()}+`;
  }

  function ageHours(item) {
    const raw = item.pub_date || item.started_at || item.start_time || '';
    if (!raw) return null;
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) return null;
    return Math.max(0, (Date.now() - ts) / 36e5);
  }

  function momentumScore(item) {
    const volume = volumeNumber(item);
    const volumePart = volume > 0 ? Math.min(70, (Math.log10(volume + 1) / 7) * 70) : 18;
    const age = ageHours(item);
    const freshnessPart = age === null ? 12 : 30 * Math.exp(-age / 24);
    return Math.round(Math.max(0, Math.min(100, volumePart + freshnessPart)));
  }

  function relativeTime(item) {
    const hours = ageHours(item);
    if (hours === null) return 'Time n/a';
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
    if (hours < 24) return `${Math.round(hours)}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function makeExploreUrl(item) {
    const query = encodeURIComponent(item.query || '');
    return `https://trends.google.com/trends/explore?date=now%207-d&geo=${encodeURIComponent(state.geo)}&q=${query}`;
  }

  function makeSearchUrl(item) {
    return `https://www.google.com/search?q=${encodeURIComponent(item.query || '')}`;
  }

  async function loadSnapshot({ quiet = false } = {}) {
    state.loadError = false;
    if (!quiet) {
      $('trend-list').innerHTML = '<div class="loading-state"><span class="spinner"></span> Loading saved trend snapshot…</div>';
      $('empty-state').hidden = true;
    }
    $('reload-button').disabled = true;
    $('reload-button').style.opacity = '.65';
    const file = `./data/trends-${state.geo}.json?reload=${Date.now()}`;
    try {
      const response = await fetch(file, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Snapshot file unavailable (${response.status})`);
      const payload = await response.json();
      if (!Array.isArray(payload.items)) throw new Error('Snapshot data format is invalid.');
      state.demo = Boolean(payload.demo);
      state.loadedAt = payload.snapshot_at || payload.generated_at || null;
      state.items = payload.items.map((item) => ({
        ...item,
        query: String(item.query || item.title || 'Untitled trend'),
        description: String(item.description || ''),
        categories: [normaliseCategory(item)],
        _volume: volumeNumber(item),
        _score: momentumScore(item),
        _age: ageHours(item)
      }));
      $('demo-banner').hidden = !state.demo;
      $('notice-banner').hidden = true;
      $('source-link').href = `https://trends.google.com/trending?geo=${encodeURIComponent(state.geo)}`;
      $('snapshot-time').textContent = state.loadedAt ? `Snapshot saved ${formatDate(state.loadedAt)}` : 'Snapshot time unavailable';
      if (!state.items.length) showNotice('The snapshot has no items yet. Run the GitHub Actions workflow to refresh this region.');
      updateCategoryFilter();
      renderDashboard();
    } catch (error) {
      state.items = [];
      state.demo = false;
      state.loadedAt = null;
      state.loadError = true;
      $('demo-banner').hidden = true;
      $('snapshot-time').textContent = 'Snapshot time unavailable';
      $('trend-list').innerHTML = '';
      showNotice(`Could not load the ${GEO[state.geo]?.name || state.geo} snapshot. ${error.message} Enable GitHub Actions and run the trend update workflow, or switch to a region with a saved snapshot.`);
      updateCategoryFilter();
      renderDashboard();
    } finally {
      $('reload-button').disabled = false;
      $('reload-button').style.opacity = '1';
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'time unavailable';
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function showNotice(message) {
    $('notice-banner').textContent = message;
    $('notice-banner').hidden = false;
  }

  function updateCategoryFilter() {
    const select = $('category-select');
    const before = select.value || 'all';
    const counts = new Map();
    state.items.forEach((item) => counts.set(item.categories[0], (counts.get(item.categories[0]) || 0) + 1));
    const ordered = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    select.innerHTML = '<option value="all">All categories</option>' + ordered.map((name) => `<option value="${safeText(name)}">${safeText(name)}</option>`).join('');
    select.value = counts.has(before) ? before : 'all';
  }

  function renderDashboard() {
    const cats = new Map();
    state.items.forEach((item) => cats.set(item.categories[0], (cats.get(item.categories[0]) || 0) + 1));
    const sortedCats = [...cats.entries()].sort((a, b) => b[1] - a[1]);
    const high = state.items.filter((item) => item._score >= 70).length;
    const leader = sortedCats[0];
    const volumeLeader = [...state.items].sort((a, b) => b._volume - a._volume)[0];
    $('metric-total').textContent = state.items.length.toLocaleString();
    $('metric-hot').textContent = high.toLocaleString();
    $('metric-category').textContent = leader ? leader[0] : '—';
    $('metric-category-caption').textContent = leader ? `${leader[1]} of ${state.items.length} visible topics` : 'Most represented topic group';
    $('metric-volume').textContent = volumeLeader ? formatVolume(volumeLeader) : '—';
    $('metric-volume-caption').textContent = volumeLeader ? volumeLeader.query : 'Highest reported search volume';
    renderBrief(sortedCats, volumeLeader);
    renderCategoryChart(sortedCats);
    renderOpportunities();
    applyFilters();
  }

  function renderBrief(sortedCats, volumeLeader) {
    const items = state.items;
    if (!items.length) {
      $('brief-content').innerHTML = '<p>No trend snapshot is available for this region yet. The dashboard will build a brief after the RSS feed is saved.</p>';
      return;
    }
    const top = [...items].sort((a, b) => b._score - a._score)[0];
    const fresh = [...items].filter((item) => item._age !== null).sort((a, b) => a._age - b._age)[0];
    const category = sortedCats[0];
    const intro = category
      ? `This snapshot leans toward <strong>${safeText(category[0].toLowerCase())}</strong> (${category[1]} ${category[1] === 1 ? 'topic' : 'topics'}). `
      : 'The current snapshot includes a mix of search topics. ';
    const leadLine = top
      ? `The highest estimated momentum signal is <strong>${safeText(top.query)}</strong> (${top._score}/100), with ${safeText(top.categories[0].toLowerCase())} context.`
      : '';
    const volumeLine = volumeLeader && volumeLeader._volume > 0
      ? `Reported volume is strongest for <strong>${safeText(volumeLeader.query)}</strong> at ${safeText(formatVolume(volumeLeader))}; this is an approximate search label, not market size.`
      : 'Volume labels are not available for all items in this feed, so momentum falls back to a neutral baseline when volume is missing.';
    const freshLine = fresh ? `Most recently timestamped item: <strong>${safeText(fresh.query)}</strong> (${relativeTime(fresh)}).` : 'The feed did not provide parseable timestamps for all topics; interpret recency cautiously.';
    $('brief-content').innerHTML = `<p>${intro}${leadLine}</p><div class="brief-bullet">${volumeLine}</div><div class="brief-bullet">${freshLine}</div>`;
  }

  function renderCategoryChart(sortedCats) {
    const target = $('category-chart');
    if (!sortedCats.length) {
      target.innerHTML = '<div class="empty-mini">Category distribution will appear when trend data is available.</div>';
      return;
    }
    const top = sortedCats.slice(0, 5);
    const max = Math.max(...top.map((entry) => entry[1]), 1);
    target.innerHTML = top.map(([name, count]) => {
      const color = CATEGORY_COLORS[name] || CATEGORY_COLORS.Other;
      const percent = Math.max(2, count / max * 100);
      return `<div class="category-line"><span class="category-name">${safeText(name)}</span><div class="category-track"><div class="category-fill" style="width:${percent}%;background:${color}"></div></div><span class="category-count">${count}</span></div>`;
    }).join('');
  }

  function ideaFor(item) {
    const topic = item.categories[0];
    const angle = {
      Sports: 'Explain the key result, turning point, and what fans should watch next.',
      Entertainment: 'Create a quick context explainer: what happened, who is involved, and why viewers are reacting.',
      Technology: 'Show what changed, who it affects, and a practical step-by-step guide.',
      Politics: 'Use a neutral explainer: verified facts, background, and what happens next.',
      Finance: 'Explain the market context and the questions readers should research. Avoid unsupported predictions.',
      Business: 'Break down the company or product angle, customer impact, and competitive context.',
      Weather: 'Add location-specific verified forecasts and practical safety or travel implications.',
      Education: 'Summarise eligibility, key dates, official links, and the next step for applicants.',
      Lifestyle: 'Turn the topic into a useful guide, checklist, or audience Q&A.',
      Other: 'Lead with a clear “what happened and why it matters” explainer; verify the context before publishing.'
    }[topic] || 'Explain what happened, why it matters, and what audiences should know next.';
    return angle;
  }

  function renderOpportunities() {
    const target = $('opportunity-content');
    if (!state.items.length) {
      target.innerHTML = '<div class="empty-mini">Content angles will appear when a snapshot is available.</div>';
      return;
    }
    const list = [...state.items].sort((a, b) => b._score - a._score).slice(0, 3);
    target.innerHTML = list.map((item, index) => `<div class="opportunity-item"><span class="opportunity-num">0${index + 1}</span><div class="opportunity-copy"><strong>${safeText(item.query)}</strong><p>${safeText(ideaFor(item))}</p></div><span class="opportunity-score">${item._score}/100</span></div>`).join('');
  }

  function applyFilters() {
    const term = $('search-input').value.trim().toLowerCase();
    const category = $('category-select').value;
    const sort = $('sort-select').value;
    let list = state.items.filter((item) => {
      const text = `${item.query} ${item.description} ${item.categories.join(' ')}`.toLowerCase();
      return (!term || text.includes(term)) && (category === 'all' || item.categories[0] === category);
    });
    if (sort === 'volume') list.sort((a, b) => b._volume - a._volume || b._score - a._score);
    else if (sort === 'recent') list.sort((a, b) => (a._age ?? Infinity) - (b._age ?? Infinity));
    else if (sort === 'az') list.sort((a, b) => a.query.localeCompare(b.query));
    else list.sort((a, b) => b._score - a._score || b._volume - a._volume);
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
      $('list-footer-text').textContent = state.items.length ? 'No topics match the current filters.' : 'No saved trend data for this region.';
      return;
    }
    target.innerHTML = items.map((item, index) => {
      const category = item.categories[0] || 'Other';
      const safeCategoryClass = category.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const scoreClass = item._score >= 70 ? 'high' : item._score >= 45 ? 'medium' : '';
      const expanded = state.expanded.has(item.query);
      const description = item.description ? `<div class="topic-description">${safeText(item.description)}</div>` : '';
      const volumeNote = item._volume > 0 ? 'Approx. search volume' : 'Volume unavailable';
      const details = expanded ? `<div class="trend-detail"><strong>Quick interpretation</strong><div>${safeText(ideaFor(item))}</div>${item.news?.length ? `<div style="margin-top:8px"><strong>Related coverage</strong><div>${item.news.slice(0,2).map((n) => safeText(n.title || n.source || '')).filter(Boolean).join(' · ')}</div></div>` : ''}<div class="detail-actions"><a class="detail-link" href="${makeExploreUrl(item)}" target="_blank" rel="noreferrer">Explore search interest ↗</a><a class="detail-link" href="${makeSearchUrl(item)}" target="_blank" rel="noreferrer">Search web ↗</a><button class="detail-copy" type="button" data-copy="${safeText(item.query)}">Copy topic ⧉</button></div></div>` : '';
      return `<article class="trend-row"><div class="topic-cell"><span class="rank-chip">${String(index + 1).padStart(2, '0')}</span><div class="topic-copy"><div class="topic-title">${safeText(item.query)}</div>${description}</div></div><span class="category-badge cat-${safeCategoryClass}">${safeText(category)}</span><div class="volume-cell"><div class="volume-main">${safeText(formatVolume(item))}</div><div class="volume-note">${volumeNote}</div></div><span class="started-text">${safeText(relativeTime(item))}</span><div class="score-wrap"><div class="score-label"><span>${item._score}</span><small>INDEX</small></div><div class="score-track"><div class="score-fill ${scoreClass}" style="width:${item._score}%"></div></div></div><div class="row-actions"><button class="row-more" type="button" data-expand="${safeText(item.query)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Hide' : 'Show'} insight for ${safeText(item.query)}">${expanded ? '×' : '···'}</button></div>${details}</article>`;
    }).join('');
    $('list-footer-text').textContent = `Showing ${items.length} of ${state.items.length} saved topics`;
  }

  function exportCsv() {
    const header = ['rank', 'query', 'category', 'search_volume_label', 'search_volume_approx', 'momentum_index', 'published_at', 'description', 'source_url'];
    const rows = state.filtered.map((item, index) => [index + 1, item.query, item.categories[0], formatVolume(item), item._volume || '', item._score, item.pub_date || '', item.description || '', makeExploreUrl(item)]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `trendscope-${state.geo.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handleListClick(event) {
    const expand = event.target.closest('[data-expand]');
    if (expand) {
      const key = expand.dataset.expand;
      if (state.expanded.has(key)) state.expanded.delete(key); else state.expanded.add(key);
      renderTrendRows(state.filtered);
      return;
    }
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      const value = copy.dataset.copy;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(value).then(() => {
          copy.textContent = 'Copied ✓';
          window.setTimeout(() => { if (copy.isConnected) copy.textContent = 'Copy topic ⧉'; }, 1200);
        }).catch(() => fallbackCopy(value, copy));
      } else fallbackCopy(value, copy);
    }
  }

  function fallbackCopy(value, button) {
    const input = document.createElement('textarea');
    input.value = value;
    input.style.position = 'fixed'; input.style.opacity = '0';
    document.body.appendChild(input); input.select();
    try { document.execCommand('copy'); button.textContent = 'Copied ✓'; } catch { button.textContent = 'Copy unavailable'; }
    input.remove();
  }

  function clearFilters() {
    $('search-input').value = '';
    $('category-select').value = 'all';
    $('sort-select').value = 'momentum';
    applyFilters();
  }

  function initTheme() {
    try {
      if (localStorage.getItem('trendscope-theme') === 'light') document.body.classList.add('light-theme');
    } catch { /* Local storage can be unavailable in strict browser contexts. */ }
    $('theme-toggle').addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      try { localStorage.setItem('trendscope-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark'); } catch { /* no-op */ }
    });
  }

  $('country-select').addEventListener('change', (event) => {
    state.geo = event.target.value;
    state.expanded.clear();
    loadSnapshot();
  });
  $('reload-button').addEventListener('click', () => loadSnapshot());
  $('search-input').addEventListener('input', applyFilters);
  $('category-select').addEventListener('change', applyFilters);
  $('sort-select').addEventListener('change', applyFilters);
  $('export-button').addEventListener('click', exportCsv);
  $('clear-filters').addEventListener('click', clearFilters);
  $('trend-list').addEventListener('click', handleListClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault(); $('search-input').focus();
    }
    if (event.key === 'Escape' && document.activeElement === $('search-input')) $('search-input').blur();
  });
  initTheme();
  loadSnapshot();
})();
