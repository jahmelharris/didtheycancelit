'use strict';

let currentFilter = 'all';
let currentSort   = 'title';
let searchQuery   = '';

const grid       = document.getElementById('shows-grid');
const noResults  = document.getElementById('no-results');
const resultsInfo = document.getElementById('results-info');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const sortSelect  = document.getElementById('sort-select');

function statusLabel(status) {
  return { cancelled: 'Cancelled', ended: 'Saved / Ended', running: 'Still Running' }[status] || status;
}

function seasonLine(show) {
  if (show.status === 'cancelled' && show.cancelledAfterSeason) {
    return `<div class="season-info">
      <span class="icon">✕</span>
      Cancelled after Season ${show.cancelledAfterSeason}
    </div>`;
  }
  if (show.status === 'ended' && show.totalSeasons) {
    return `<div class="season-info saved">
      <span class="icon">✓</span>
      Ran for ${show.totalSeasons} season${show.totalSeasons !== 1 ? 's' : ''}
    </div>`;
  }
  return '';
}

function infoBlock(show) {
  if (show.cliffhanger) {
    const note = show.cliffhangerNote
      ? `<span class="info-block-note">${show.cliffhangerNote}</span>`
      : '';
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
      <i class="info-block-icon">✓</i>
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

  return `
    <article class="show-card ${show.status}" style="animation-delay:${index * 30}ms">
      <div class="card-stripe"></div>
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

  if (currentFilter === 'cancelled')  result = result.filter(s => s.status === 'cancelled');
  if (currentFilter === 'ended')      result = result.filter(s => s.status === 'ended');
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
  document.getElementById('stat-total').textContent      = shows.length;
  document.getElementById('stat-cancelled').textContent  = shows.filter(s => s.status === 'cancelled').length;
  document.getElementById('stat-cliffhanger').textContent = shows.filter(s => s.cliffhanger).length;
  document.getElementById('stat-saved').textContent      = shows.filter(s => s.status === 'ended').length;
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

  const suffix = currentFilter !== 'all'
    ? ` · filtered from ${shows.length}`
    : '';
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
