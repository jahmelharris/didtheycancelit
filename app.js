'use strict';

// ── State ─────────────────────────────────────────────────
let currentFilter = 'all';
let currentSort   = 'title';
let searchQuery   = '';

// In-memory image cache: showId -> url string | null
const imageCache = {};

// ── DOM refs ──────────────────────────────────────────────
const grid        = document.getElementById('shows-grid');
const noResults   = document.getElementById('no-results');
const resultsInfo = document.getElementById('results-info');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const sortSelect  = document.getElementById('sort-select');

// ── Image loading ─────────────────────────────────────────

const LS_KEY = 'hibc_images_v2';
const LS_TTL = 48 * 60 * 60 * 1000; // 48 hours

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
    // Apply images found so far without waiting for all batches
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

async function loadImages() {
  // Seed in-memory cache from localStorage
  const stored = readLocalCache();
  if (stored) Object.assign(imageCache, stored);

  // Apply whatever is already cached
  applyImages();

  // Fetch any that are missing
  const needFetch = shows.filter(s => !(s.id in imageCache));
  if (needFetch.length === 0) return;

  await fetchInBatches(needFetch);

  // Persist full cache
  writeLocalCache(imageCache);
}

// ── Render helpers ────────────────────────────────────────

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

  // If image already in memory cache, pre-populate so no flicker on re-renders
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

// ── Filter / sort / render ────────────────────────────────

function filteredShows() {
  let result = [...shows];

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(s =>
      s.title.toLowerCase().includes(q)   ||
      s.network.toLowerCase().includes(q) ||
      s.genres.some(g => g.toLowerCase().includes(q)) ||
      s.note.toLowerCase().includes(q)
    );
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

function updateStats() {
  document.getElementById('stat-total').textContent       = shows.length;
  document.getElementById('stat-cancelled').textContent   = shows.filter(s => s.status === 'cancelled').length;
  document.getElementById('stat-cliffhanger').textContent = shows.filter(s => s.cliffhanger).length;
  document.getElementById('stat-saved').textContent       = shows.filter(s => s.status === 'ended').length;
}

function render() {
  const list = filteredShows();

  if (list.length === 0) {
    grid.innerHTML = '';
    noResults.hidden = false;
    resultsInfo.textContent = 'No shows found';
    return;
  }

  noResults.hidden = true;
  grid.innerHTML = list.map((show, i) => renderCard(show, i)).join('');

  // Apply any images already cached in memory to freshly rendered elements
  applyImages();

  const suffix = currentFilter !== 'all' ? ` · filtered from ${shows.length}` : '';
  resultsInfo.textContent = `Showing ${list.length} show${list.length !== 1 ? 's' : ''}${suffix}`;
}

// ── Event wiring ──────────────────────────────────────────

searchInput.addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  searchClear.classList.toggle('visible', searchQuery.length > 0);
  render();
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchClear.classList.remove('visible');
  searchInput.focus();
  render();
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

sortSelect.addEventListener('change', e => {
  currentSort = e.target.value;
  render();
});

// ── Init ──────────────────────────────────────────────────
updateStats();
render();
loadImages(); // async — does not block initial render
