'use strict';

const PARAMS       = new URLSearchParams(window.location.search);
const CURRENT_PAGE = Math.max(1, parseInt(PARAMS.get('page') || '1', 10));

const PER_PAGE = 24;

// ── State ──────────────────────────────────────────────────────
let currentFilter  = 'all';
let currentSort    = 'title';
let searchQuery    = '';
let searchPage     = 1;
let allShowsLoaded = false;

// ── DOM refs ───────────────────────────────────────────────────
const grid         = document.getElementById('shows-grid');
const noResults    = document.getElementById('no-results');
const resultsInfo  = document.getElementById('results-info');
const searchInput  = document.getElementById('search-input');
const searchClear  = document.getElementById('search-clear');
const sortSelect   = document.getElementById('sort-select');
const paginationEl = document.getElementById('pagination');

// ── Image loading ──────────────────────────────────────────────

const LS_KEY = 'hibc_images_v2';
const LS_TTL = 48 * 60 * 60 * 1000;
const imageCache = {};

function readLocalCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > LS_TTL) { localStorage.removeItem(LS_KEY); return null; }
    return data;
  } catch { return null; }
}

function writeLocalCache(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

async function fetchImage(show) {
  const q = encodeURIComponent(show.tvmazeQuery || show.title);
  try {
    const res = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${q}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.image?.medium || json.image?.original || null;
  } catch { return null; }
}

async function fetchInBatches(items, batchSize = 6) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(show => fetchImage(show).then(url => ({ id: show.id, url })))
    );
    results.forEach(r => {
      if (r.status === 'fulfilled') imageCache[r.value.id] = r.value.url;
    });
    applyImages();
  }
}

function applyImages() {
  Object.entries(imageCache).forEach(([id, url]) => {
    const poster = document.querySelector(`.card-poster[data-showid="${id}"]`);
    if (!poster || poster.classList.contains('loaded') || poster.classList.contains('error')) return;
    if (url) {
      const img = poster.querySelector('img');
      img.onload  = () => poster.classList.add('loaded');
      img.onerror = () => poster.classList.add('error');
      img.src = url;
    } else {
      poster.classList.add('error');
    }
  });
}

async function loadImages(shows) {
  const stored = readLocalCache();
  if (stored) Object.assign(imageCache, stored);
  applyImages();
  const needFetch = shows.filter(s => !(s.id in imageCache));
  if (needFetch.length === 0) return;
  await fetchInBatches(needFetch);
  writeLocalCache(imageCache);
}

// ── Script loading ─────────────────────────────────────────────

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureAllShows() {
  if (allShowsLoaded) return;
  await loadScript('data.js');
  allShowsLoaded = true;
}

// ── Render helpers ─────────────────────────────────────────────

function statusLabel(status) {
  return { cancelled: 'Cancelled', ended: 'Saved / Ended', running: 'Still Running' }[status] || status;
}

function seasonLine(show) {
  if (show.status === 'cancelled' && show.cancelledAfterSeason) {
    return `<div class="season-info">
      <span class="icon">&#x2715;</span>
      Cancelled after Season ${show.cancelledAfterSeason}
    </div>`;
  }
  if (show.status === 'ended' && show.totalSeasons) {
    return `<div class="season-info saved">
      <span class="icon">&#x2713;</span>
      Ran for ${show.totalSeasons} season${show.totalSeasons !== 1 ? 's' : ''}
    </div>`;
  }
  return '';
}

function infoBlock(show) {
  if (show.cliffhanger) {
    const note = show.cliffhangerNote
      ? `<span class="info-block-note">${show.cliffhangerNote}</span>` : '';
    return `<div class="info-block cliffhanger">
      <i class="info-block-icon">!</i>
      <div class="info-block-text">
        <span class="info-block-label">Left on a Cliffhanger</span>
        ${note}
      </div>
    </div>`;
  }
  if (show.cliffhangerNote) {
    return `<div class="info-block resolution">
      <i class="info-block-icon">&#x2713;</i>
      <div class="info-block-text">
        <span class="info-block-label">Note</span>
        <span class="info-block-note">${show.cliffhangerNote}</span>
      </div>
    </div>`;
  }
  return '';
}

function renderCard(show, index) {
  const genres = show.genres.map(g => `<span class="genre-tag">${g}</span>`).join('');
  const url = imageCache[show.id];
  const posterClass = url ? 'card-poster loaded' : (imageCache[show.id] === null ? 'card-poster error' : 'card-poster');
  const imgSrc = url ? `src="${url}"` : '';

  return `
    <article class="show-card ${show.status}${show.cliffhanger ? ' cliffhanger' : ''}" style="animation-delay:${index * 25}ms">
      <div class="${posterClass}" data-showid="${show.id}">
        <img ${imgSrc} alt="${show.title} poster" loading="lazy">
        <div class="poster-placeholder">
          <span class="poster-initial">${show.title.charAt(0).toUpperCase()}</span>
        </div>
      </div>
      <div class="card-body">
        <div class="card-header">
          <h2 class="show-title">${show.title}</h2>
          <span class="status-badge ${show.status}">${statusLabel(show.status)}</span>
        </div>
        <div class="card-meta">
          <span class="network-badge">${show.network}</span>
          <span class="years-text">${show.years}</span>
        </div>
        <div class="genres">${genres}</div>
        ${seasonLine(show)}
        ${infoBlock(show)}
      </div>
      <div class="card-footer">
        <p class="show-note">${show.note}</p>
      </div>
    </article>
  `;
}

// ── Stats ──────────────────────────────────────────────────────

function updateStats() {
  const s = window.pageMetadata?.stats;
  if (!s) return;
  document.getElementById('stat-total').textContent       = s.total;
  document.getElementById('stat-cancelled').textContent   = s.cancelled;
  document.getElementById('stat-cliffhanger').textContent = s.cliffhanger;
  document.getElementById('stat-saved').textContent       = s.ended;
}

// ── Pagination ─────────────────────────────────────────────────

function renderPagination(totalPages) {
  if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }

  const curr = CURRENT_PAGE;
  const pages = new Set([1, totalPages]);
  for (let i = Math.max(1, curr - 2); i <= Math.min(totalPages, curr + 2); i++) pages.add(i);
  const sorted = [...pages].sort((a, b) => a - b);

  let html = '<nav class="pagination-nav" aria-label="Browse pages">';

  html += curr > 1
    ? `<a href="?page=${curr - 1}" class="page-btn page-prev">&#8592; Prev</a>`
    : `<span class="page-btn page-prev page-disabled">&#8592; Prev</span>`;

  let last = 0;
  for (const p of sorted) {
    if (last && p - last > 1) html += `<span class="page-ellipsis">…</span>`;
    html += p === curr
      ? `<span class="page-btn page-current" aria-current="page">${p}</span>`
      : `<a href="?page=${p}" class="page-btn">${p}</a>`;
    last = p;
  }

  html += curr < totalPages
    ? `<a href="?page=${curr + 1}" class="page-btn page-next">Next &#8594;</a>`
    : `<span class="page-btn page-next page-disabled">Next &#8594;</span>`;

  html += '</nav>';
  paginationEl.innerHTML = html;
}

// ── Filter / sort ──────────────────────────────────────────────

function isFiltered() {
  return searchQuery || currentFilter !== 'all';
}

function applyFiltersAndSort(source) {
  let result = [...source];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(s => s.title.toLowerCase().includes(q));
  }

  if (currentFilter === 'cancelled')   result = result.filter(s => s.status === 'cancelled');
  if (currentFilter === 'ended')       result = result.filter(s => s.status === 'ended');
  if (currentFilter === 'cliffhanger') result = result.filter(s => s.cliffhanger);

  result.sort((a, b) => {
    switch (currentSort) {
      case 'title':       return a.title.localeCompare(b.title);
      case 'year-desc':   return b.startYear - a.startYear;
      case 'year-asc':    return a.startYear - b.startYear;
      case 'season-desc': return (b.cancelledAfterSeason || b.totalSeasons || 0)
                               - (a.cancelledAfterSeason || a.totalSeasons || 0);
      default:            return 0;
    }
  });

  return result;
}

// ── Render ─────────────────────────────────────────────────────

function renderList(list, infoText) {
  if (list.length === 0) {
    grid.innerHTML = '';
    noResults.hidden = false;
    resultsInfo.textContent = 'No shows found';
    paginationEl.innerHTML = '';
    return;
  }
  noResults.hidden = true;
  grid.innerHTML = list.map((s, i) => renderCard(s, i)).join('');
  applyImages();
  resultsInfo.textContent = infoText;
}

function renderPage() {
  const meta  = window.pageMetadata || {};
  const shows = window.pageShows    || [];
  const list  = applyFiltersAndSort(shows);
  const total = meta.stats?.total   || 0;
  const start = (CURRENT_PAGE - 1) * (meta.perPage || 24) + 1;
  const end   = Math.min(CURRENT_PAGE * (meta.perPage || 24), total);

  renderList(list, `Showing ${start}–${end} of ${total} shows`);
  renderPagination(meta.totalPages || 1);
}

async function renderFiltered() {
  if (!allShowsLoaded) {
    resultsInfo.textContent = 'Loading…';
    grid.innerHTML = '';
    paginationEl.innerHTML = '';
    await ensureAllShows();
  }

  const allFiltered   = applyFiltersAndSort(window.shows || []);
  const totalResults  = allFiltered.length;
  const totalPages    = Math.ceil(totalResults / PER_PAGE);
  searchPage          = Math.min(searchPage, Math.max(1, totalPages));

  const start      = (searchPage - 1) * PER_PAGE;
  const pageSlice  = allFiltered.slice(start, start + PER_PAGE);
  const globalTotal = window.pageMetadata?.stats?.total || totalResults;

  let infoText;
  if (totalResults === 0) {
    infoText = 'No shows found';
  } else {
    const end    = Math.min(start + PER_PAGE, totalResults);
    const suffix = currentFilter !== 'all' ? ` of ${globalTotal}` : '';
    infoText = `Showing ${start + 1}–${end} of ${totalResults} result${totalResults !== 1 ? 's' : ''}${suffix}`;
  }

  renderList(pageSlice, infoText);
  renderSearchPagination(totalPages);
  loadImages(pageSlice);
}

function renderSearchPagination(totalPages) {
  if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }

  const curr = searchPage;
  const pages = new Set([1, totalPages]);
  for (let i = Math.max(1, curr - 2); i <= Math.min(totalPages, curr + 2); i++) pages.add(i);
  const sorted = [...pages].sort((a, b) => a - b);

  let html = '<nav class="pagination-nav" aria-label="Search result pages">';

  html += curr > 1
    ? `<button class="page-btn page-prev" data-sp="${curr - 1}">&#8592; Prev</button>`
    : `<span class="page-btn page-prev page-disabled">&#8592; Prev</span>`;

  let last = 0;
  for (const p of sorted) {
    if (last && p - last > 1) html += `<span class="page-ellipsis">…</span>`;
    html += p === curr
      ? `<span class="page-btn page-current" aria-current="page">${p}</span>`
      : `<button class="page-btn" data-sp="${p}">${p}</button>`;
    last = p;
  }

  html += curr < totalPages
    ? `<button class="page-btn page-next" data-sp="${curr + 1}">Next &#8594;</button>`
    : `<span class="page-btn page-next page-disabled">Next &#8594;</span>`;

  html += '</nav>';
  paginationEl.innerHTML = html;

  paginationEl.querySelectorAll('button[data-sp]').forEach(btn => {
    btn.addEventListener('click', () => {
      searchPage = parseInt(btn.dataset.sp, 10);
      renderFiltered();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function render() {
  if (isFiltered()) {
    renderFiltered();
  } else {
    renderPage();
  }
}

// ── Event wiring ───────────────────────────────────────────────

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  searchPage  = 1;
  searchClear.classList.toggle('visible', searchQuery.length > 0);
  render();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchPage  = 1;
  searchClear.classList.remove('visible');
  searchInput.focus();
  render();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    searchPage    = 1;
    render();
  });
});

sortSelect.addEventListener('change', e => {
  currentSort = e.target.value;
  searchPage  = 1;
  render();
});

// ── Init ───────────────────────────────────────────────────────

(async function init() {
  await loadScript(`pages/page-${CURRENT_PAGE}.js`);
  updateStats();
  render();
  loadImages(window.pageShows || []);
})();
