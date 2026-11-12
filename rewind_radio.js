/**
 * REWIND RADIO — Apple-Inspired Liquid Glass UI & Dynamic Island Music Experience
 * Multi-signal recommendation engine, fluid iOS physics, Dynamic Island controller,
 * four prominent discovery pathways (Play Random, Top Hits, Car Walla, Bike Walla),
 * and an Apple Music-style redesigned full-screen glass player.
 */

import { recommendationService, REC_STORAGE_KEYS } from './recommendation_engine.js';
import { messageEngine } from './messages.js';

// Local Storage Keys
const STORAGE_KEYS = {
  PREFS: 'rewind_player_prefs_v3',
  SESSION_ID: 'rewind_radio_session_id_v3'
};

// Global State
let catalogTracks = [];
let ytPlayer = null;
let isPlayerReady = false;
let currentTrack = null;
let playbackQueue = [];
let queueIndex = -1;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 'all'; // 'off' | 'all' | 'one'
let currentVolume = 80;
let isMuted = false;
let currentTimeSec = 0;
let durationSec = 0;
let progressTicker = null;
let activeTab = 'home';
let lastActiveTab = 'home';
let currentSearchQuery = '';
let currentSearchProvider = 'all'; // 'all' | 'youtube' | 'spotify'
let messageRotateTimer = null;

// Dynamic Island & Collection Sheet State
let isDynamicIslandExpanded = false;
let currentCollectionType = null;
let currentCollectionFilter = 'all';
let currentCollectionTracks = [];

// WebSocket Presence State
let presenceSocket = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let activityDismissTimeout = null;

// Unique session ID per browser (deduplicates tabs)
let sessionId = getStorage(STORAGE_KEYS.SESSION_ID, null);
if (!sessionId) {
  sessionId = `sess_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;
  setStorage(STORAGE_KEYS.SESSION_ID, sessionId);
}

// Storage Helpers
function getStorage(key, fallback) {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (_) {
    return fallback;
  }
}

function setStorage(key, value) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (_) {}
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function showRadioToast(msg) {
  let toast = document.getElementById('toastNotification');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

// --------------------------------------------------------------------------
// 1. CONTEXTUAL GREETING & AMBIENT COLOR THEME
// --------------------------------------------------------------------------
function updateContextualGreeting() {
  const el = document.getElementById('rrMainGreeting');
  if (!el) return;
  const hour = new Date().getHours();
  let timeStr = 'evening';
  if (hour >= 5 && hour < 12) timeStr = 'morning';
  else if (hour >= 12 && hour < 17) timeStr = 'afternoon';
  el.textContent = `Good ${timeStr}. What are we listening to?`;
}

function updateAmbientColors(track) {
  if (!track) return;
  const root = document.documentElement;
  const mood = (track.mood || '').toLowerCase();
  const title = (track.title || '').toLowerCase();
  const artist = (track.artist || '').toLowerCase();

  let c1, c2, glow;

  if (title.includes('blinding') || artist.includes('weeknd') || mood === 'romantic') {
    // Crimson & Amber Sunset
    c1 = 'rgba(239, 68, 68, 0.28)';
    c2 = 'rgba(245, 158, 11, 0.22)';
    glow = 'rgba(239, 68, 68, 0.45)';
  } else if (mood === 'highway' || (track.categories && track.categories.includes('Highway Long Drive'))) {
    // Emerald & Teal Highway
    c1 = 'rgba(16, 185, 129, 0.26)';
    c2 = 'rgba(13, 148, 136, 0.2)';
    glow = 'rgba(16, 185, 129, 0.45)';
  } else if (track.language === 'English' || mood === 'trending') {
    // Electric Violet & Soft Cyan
    c1 = 'rgba(139, 92, 246, 0.3)';
    c2 = 'rgba(34, 211, 238, 0.22)';
    glow = 'rgba(139, 92, 246, 0.45)';
  } else if (track.era === '90s' || mood === 'classic') {
    // Golden Era Warm Amber & Rose
    c1 = 'rgba(245, 158, 11, 0.26)';
    c2 = 'rgba(244, 63, 94, 0.2)';
    glow = 'rgba(245, 158, 11, 0.45)';
  } else {
    // Adrenaline Blue & Violet
    c1 = 'rgba(59, 130, 246, 0.28)';
    c2 = 'rgba(139, 92, 246, 0.22)';
    glow = 'rgba(59, 130, 246, 0.45)';
  }

  root.style.setProperty('--ambient-c1', c1);
  root.style.setProperty('--ambient-c2', c2);
  root.style.setProperty('--ambient-glow', glow);
}

// --------------------------------------------------------------------------
// 2. VIEW SWITCHING (Downloader <--> Rewind Radio)
// --------------------------------------------------------------------------
export function switchView(targetView) {
  const downloaderView = document.querySelector('.experience-viewport');
  const rewindView = document.getElementById('rewindRadioView');
  const headerNav = document.querySelector('.header-nav');
  const navDownloader = document.getElementById('navDownloader');
  const navRewindRadio = document.getElementById('navRewindRadio');

  if (targetView === 'rewind') {
    if (downloaderView) downloaderView.style.display = 'none';
    if (headerNav) headerNav.style.display = 'none';
    if (rewindView) {
      rewindView.classList.add('active');
    }
    document.body.classList.add('rewind-active');
    document.body.style.backgroundColor = '#07090e';
    window.scrollTo(0, 0);
    if (!window.location.hash.startsWith('#rewind')) {
      history.replaceState(null, '', `#rewind/${activeTab || 'home'}`);
    }
    if (navRewindRadio) navRewindRadio.classList.add('active');
    if (navDownloader) navDownloader.classList.remove('active');
  } else {
    if (rewindView) rewindView.classList.remove('active');
    if (downloaderView) downloaderView.style.display = 'flex';
    if (headerNav) headerNav.style.display = 'flex';
    document.body.classList.remove('rewind-active');
    document.body.classList.remove('rr-nowplaying-active');
    document.body.style.backgroundColor = '';
    if (navRewindRadio) navRewindRadio.classList.remove('active');
    if (navDownloader) navDownloader.classList.add('active');
    history.replaceState(null, '', '#downloader');
  }
}

// --------------------------------------------------------------------------
// 3. TAB NAVIGATION (Home | Search | Your Library)
// --------------------------------------------------------------------------
const SPA_VIEWS = {
  home: 'rrViewHome',
  search: 'rrViewSearch',
  random: 'rrViewRandom',
  hits: 'rrViewHits',
  car: 'rrViewCarWalla',
  bike: 'rrViewBikeWalla',
  library: 'rrViewLibrary',
  nowplaying: 'rrViewNowPlaying'
};

export function switchMusicTab(tabName, options = {}) {
  if (!document.body.classList.contains('rewind-active')) {
    switchView('rewind');
  }

  const target = SPA_VIEWS[tabName] ? tabName : 'home';
  if (target !== 'nowplaying') {
    lastActiveTab = target;
  }
  activeTab = target;

  if (options.pushHash !== false) {
    if (window.location.hash.startsWith('#rewind')) {
      history.replaceState(null, '', `#rewind/${target}`);
    }
  }

  const rewindView = document.getElementById('rewindRadioView');
  if (target === 'nowplaying') {
    document.body.classList.add('rr-nowplaying-active');
    if (rewindView) rewindView.classList.add('nowplaying-mode');
  } else {
    document.body.classList.remove('rr-nowplaying-active');
    if (rewindView) rewindView.classList.remove('nowplaying-mode');
    const npLayout = document.querySelector('.rr-np-layout');
    if (npLayout) npLayout.classList.remove('mobile-lyrics-open');
    const npWrapper = document.querySelector('.rr-nowplaying-wrapper');
    if (npWrapper) npWrapper.classList.remove('show-lyrics');
    const npLyricsToggle = document.getElementById('rrNpMobileLyricsToggle');
    if (npLyricsToggle) npLyricsToggle.classList.remove('active');
  }

  // Update navigation button active states
  document.querySelectorAll('.rr-tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === target);
  });
  document.querySelectorAll('.mob-nav-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === target);
  });

  // Switch SPA views smoothly without page reload or interrupting playback
  Object.entries(SPA_VIEWS).forEach(([key, viewId]) => {
    const el = document.getElementById(viewId);
    if (el) {
      if (key === target) {
        el.style.display = 'block';
        el.classList.add('active');
        el.scrollTop = 0;
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    }
  });


  // Trigger view specific initializers
  if (target === 'library') {
    renderLibraryView();
  } else if (target === 'search') {
    const input = document.getElementById('rrSearchInput');
    if (input) setTimeout(() => input.focus(), 80);
    renderRecentSearches();
  } else if (target === 'random') {
    renderRandomQueueList();
  } else if (target === 'hits') {
    renderHitsView('all');
  } else if (target === 'car') {
    renderCarView('all');
  } else if (target === 'bike') {
    renderBikeView('all');
  } else if (target === 'nowplaying') {
    renderNowPlayingView();
  }
}

// --------------------------------------------------------------------------
// 4. DYNAMIC ISLAND CONTROLLER (APPLE-INSPIRED EXPANSION & WAVEFORMS)
// --------------------------------------------------------------------------
export function expandDynamicIsland() {
  const island = document.getElementById('rrDynamicIsland');
  const collapsed = document.getElementById('diCollapsed');
  const expanded = document.getElementById('diExpanded');
  if (!island || !collapsed || !expanded) return;

  isDynamicIslandExpanded = true;
  island.classList.add('expanded');
  island.setAttribute('aria-expanded', 'true');
  collapsed.style.display = 'none';
  expanded.style.display = 'flex';
  if (currentTrack) {
    updateDynamicIslandUI();
  }
}

export function collapseDynamicIsland() {
  const island = document.getElementById('rrDynamicIsland');
  const collapsed = document.getElementById('diCollapsed');
  const expanded = document.getElementById('diExpanded');
  if (!island || !collapsed || !expanded) return;

  isDynamicIslandExpanded = false;
  island.classList.remove('expanded');
  island.setAttribute('aria-expanded', 'false');
  expanded.style.display = 'none';
  collapsed.style.display = 'flex';
}

export function toggleDynamicIsland() {
  if (isDynamicIslandExpanded) {
    collapseDynamicIsland();
  } else {
    expandDynamicIsland();
  }
}

function updateDynamicIslandUI() {
  if (!currentTrack) return;
  const diThumb = document.getElementById('diThumb');
  const diExpThumb = document.getElementById('diExpThumb');
  const diTitle = document.getElementById('diTitle');
  const diExpTitle = document.getElementById('diExpTitle');
  const diArtist = document.getElementById('diArtist');
  const diExpArtist = document.getElementById('diExpArtist');
  const diCur = document.getElementById('diCurTime');
  const diDur = document.getElementById('diDurTime');
  const diScrub = document.getElementById('diScrubSlider');
  const diFill = document.getElementById('diScrubFill');

  if (diThumb) diThumb.src = currentTrack.artwork;
  if (diExpThumb) diExpThumb.src = currentTrack.artworkHigh || currentTrack.artwork;
  if (diTitle) diTitle.textContent = currentTrack.title;
  if (diExpTitle) diExpTitle.textContent = currentTrack.title;
  if (diArtist) diArtist.textContent = currentTrack.artist;
  if (diExpArtist) diExpArtist.textContent = currentTrack.artist;

  if (diCur) diCur.textContent = formatTime(currentTimeSec);
  if (diDur) diDur.textContent = formatTime(durationSec);
  if (diScrub && !diScrub.matches(':active')) {
    diScrub.max = durationSec || 100;
    diScrub.value = currentTimeSec;
  }
  if (diFill) {
    const pct = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0;
    diFill.style.width = `${pct}%`;
  }
}

// --------------------------------------------------------------------------
// 5. FOUR MAIN DISCOVERY OPTIONS & COLLECTION SHEET SYSTEM
// --------------------------------------------------------------------------

// Option 1: PLAY RANDOM (Smart multi-signal recommendation shuffle)
export function playSmartRandom() {
  const randomTrack = recommendationService.discoverSomethingNew(catalogTracks);
  if (randomTrack) {
    // Populate an intelligent queue based on recommendations
    const rankedQueue = recommendationService.getPersonalizedRecommendations(catalogTracks, 20);
    playTrack(randomTrack, rankedQueue.length > 0 ? rankedQueue : catalogTracks);
    showRadioToast(`🔀 Smart Shuffle: ${randomTrack.title}`);
  } else if (catalogTracks.length > 0) {
    const idx = Math.floor(Math.random() * catalogTracks.length);
    playTrack(catalogTracks[idx], catalogTracks, idx);
    showRadioToast(`🔀 Playing: ${catalogTracks[idx].title}`);
  }
}

// Collection definitions with subcategories
const COLLECTION_CONFIGS = {
  hits: {
    badge: 'VIRAL CHARTS',
    title: 'Top Hits',
    desc: 'Verified global chartbusters, Bollywood viral hits & Punjabi anthems',
    filterTabs: [
      { id: 'all', label: 'All Top Hits' },
      { id: 'english', label: 'Global English' },
      { id: 'bollywood', label: 'Bollywood Viral' },
      { id: 'punjabi', label: 'Punjabi Anthems' }
    ],
    filterFn: (track, filter) => {
      const isTrending = track.isTrending || (track.categories && track.categories.includes('Top Trending Mix'));
      if (filter === 'english') {
        return track.language === 'English';
      }
      if (filter === 'bollywood') {
        return track.language === 'Hindi' && isTrending;
      }
      if (filter === 'punjabi') {
        const lang = (track.language || '').toLowerCase();
        const artist = (track.artist || '').toLowerCase();
        return lang.includes('punjabi') || artist.includes('diljit') || artist.includes('karan aujla');
      }
      return isTrending || track.category === 'trending-eng';
    }
  },
  car: {
    badge: 'DRIVER’S CHOICE',
    title: 'Car Walla — Driving & Road Trips',
    desc: 'Highway vibes, long drives, bass & beats curated for drivers',
    filterTabs: [
      { id: 'all', label: 'All Driving' },
      { id: 'highway', label: 'Highway Vibes' },
      { id: 'longdrive', label: 'Long Drive Bollywood' },
      { id: 'night', label: 'Night Drive' },
      { id: 'bass', label: 'Bass & Beats' },
      { id: 'retro', label: 'Retro Road Trip' },
      { id: 'romantic', label: 'Romantic Drive' }
    ],
    filterFn: (track, filter) => {
      const cats = track.categories || [];
      const title = (track.title || '').toLowerCase();
      const mood = (track.mood || '').toLowerCase();

      if (filter === 'highway') {
        return cats.includes('Highway Long Drive') || title.includes('blinding') || title.includes('tauba') || title.includes('starboy');
      }
      if (filter === 'longdrive') {
        return track.language === 'Hindi' && (mood === 'highway' || mood === 'romantic' || cats.includes('Highway Long Drive'));
      }
      if (filter === 'night') {
        return title.includes('blinding') || title.includes('starboy') || title.includes('tum hi ho') || mood === 'monsoon';
      }
      if (filter === 'bass') {
        return title.includes('tauba') || title.includes('aaj ki raat') || title.includes('stay') || title.includes('espresso');
      }
      if (filter === 'retro') {
        return track.era === '90s' || cats.includes('Evergreen Hits') || cats.includes('Golden Era Classics');
      }
      if (filter === 'romantic') {
        return cats.includes('Romantic Nostalgia') || mood === 'romantic';
      }
      // 'all' driving
      return cats.includes('Highway Long Drive') || mood === 'highway' || track.isTrending || track.era === '90s';
    }
  },
  bike: {
    badge: 'RIDE MODE',
    title: 'Bike Walla — Motorcycle Rides & Adrenaline',
    desc: 'Adrenaline cruiser, night rider, retro rock & wind-in-hair anthems',
    filterTabs: [
      { id: 'all', label: 'All Rides' },
      { id: 'ridemode', label: 'Ride Mode' },
      { id: 'highway', label: 'Highway Anthems' },
      { id: 'night', label: 'Night Rider' },
      { id: 'retrorock', label: 'Retro Rock' },
      { id: 'punjabi', label: 'Punjabi Ride' },
      { id: 'classics', label: 'Long Ride Classics' }
    ],
    filterFn: (track, filter) => {
      const cats = track.categories || [];
      const title = (track.title || '').toLowerCase();
      const artist = (track.artist || '').toLowerCase();

      if (filter === 'ridemode') {
        return title.includes('blinding') || title.includes('starboy') || title.includes('tauba') || title.includes('flowers');
      }
      if (filter === 'highway') {
        return title.includes('levitating') || title.includes('espresso') || title.includes('as it was') || cats.includes('Highway Long Drive');
      }
      if (filter === 'night') {
        return title.includes('blinding') || title.includes('birds') || title.includes('stay') || title.includes('aaj ki raat');
      }
      if (filter === 'retrorock') {
        return title.includes('tip tip') || cats.includes('Golden Era Classics') || artist.includes('kishore');
      }
      if (filter === 'punjabi') {
        return artist.includes('diljit') || artist.includes('karan aujla') || (track.language || '').toLowerCase().includes('punjabi');
      }
      if (filter === 'classics') {
        return track.era === '90s' || cats.includes('Evergreen Hits');
      }
      // 'all' rides
      return track.isTrending || cats.includes('Highway Long Drive') || title.includes('blinding') || artist.includes('diljit');
    }
  }
};

export function openCollectionSheet(type, filter = 'all') {
  currentCollectionType = type;
  currentCollectionFilter = filter;
  const config = COLLECTION_CONFIGS[type];
  if (!config) return;

  const modal = document.getElementById('rrCollectionSheet');
  const badgeEl = document.getElementById('rrSheetBadge');
  const titleEl = document.getElementById('rrSheetTitle');
  const descEl = document.getElementById('rrSheetDesc');
  const filterBar = document.getElementById('rrSheetFilterBar');

  if (badgeEl) badgeEl.textContent = config.badge;
  if (titleEl) titleEl.textContent = config.title;
  if (descEl) descEl.textContent = config.desc;

  // Render Filter Pills
  if (filterBar) {
    filterBar.innerHTML = config.filterTabs.map(tab => `
      <button class="sheet-filter-pill ${tab.id === currentCollectionFilter ? 'active' : ''}" data-filter-id="${tab.id}" type="button">
        ${tab.label}
      </button>
    `).join('');

    filterBar.querySelectorAll('.sheet-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const selectedId = btn.getAttribute('data-filter-id');
        openCollectionSheet(type, selectedId);
      });
    });
  }

  // Filter Catalog
  currentCollectionTracks = catalogTracks.filter(t => config.filterFn(t, currentCollectionFilter));
  if (currentCollectionTracks.length === 0) {
    currentCollectionTracks = catalogTracks.slice(0, 15);
  }

  // Render Track List
  renderCollectionTrackList(currentCollectionTracks);

  if (modal) modal.classList.add('open');
}

export function closeCollectionSheet() {
  const modal = document.getElementById('rrCollectionSheet');
  if (modal) modal.classList.remove('open');
}

function renderCollectionTrackList(tracks) {
  const container = document.getElementById('rrSheetTrackList');
  if (!container) return;

  container.innerHTML = tracks.map((t, idx) => `
    <div class="sheet-track-row" data-track-index="${idx}">
      <img class="sheet-track-thumb" src="${t.artwork}" alt="${t.title}" loading="lazy">
      <div class="sheet-track-meta">
        <div class="sheet-track-title">${t.title}</div>
        <div class="sheet-track-artist">${t.artist}</div>
      </div>
      <span class="sheet-track-dur">${t.duration || '3:30'}</span>
    </div>
  `).join('');

  container.querySelectorAll('.sheet-track-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.getAttribute('data-track-index'), 10);
      playTrack(tracks[idx], tracks, idx);
      closeCollectionSheet();
      showRadioToast(`▶ Playing: ${tracks[idx].title}`);
    });
  });
}

// --------------------------------------------------------------------------
// 6. RECENTLY PLAYED SECTION
// --------------------------------------------------------------------------
function renderRecentlyPlayed() {
  const section = document.getElementById('rrRecentlyPlayedSection');
  const carousel = document.getElementById('rrRecentlyPlayedCarousel');
  if (!section || !carousel) return;

  const recent = recommendationService.getListeningHistory(catalogTracks);
  if (!recent || recent.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  carousel.innerHTML = recent.slice(0, 12).map(t => createMusicCardHTML(t)).join('');

  carousel.querySelectorAll('.rr-music-card').forEach(card => {
    card.addEventListener('click', () => {
      const trackId = card.getAttribute('data-track-id');
      const track = catalogTracks.find(t => t.id === trackId) || recent.find(t => t.id === trackId);
      if (track) playTrack(track, recent);
    });
  });
}

function createMusicCardHTML(track) {
  const isCurrentlyPlaying = currentTrack?.id === track.id && isPlaying;
  return `
    <div class="rr-music-card" data-track-id="${track.id}" role="button" tabindex="0">
      <div class="card-thumb-wrap">
        <img class="card-thumb" src="${track.artworkHigh || track.artwork}" alt="${track.title}" loading="lazy">
        <button class="card-play-btn" type="button" aria-label="Play ${track.title}">
          ${isCurrentlyPlaying
            ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
            : '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><polygon points="6 4 19 12 6 20 6 4"/></svg>'
          }
        </button>
      </div>
      <h3 class="card-title" title="${track.title}">${track.title}</h3>
      <p class="card-artist" title="${track.artist}">${track.artist}</p>
    </div>
  `;
}

// --------------------------------------------------------------------------
// 7. SEARCH VIEW CONTROLLER
// --------------------------------------------------------------------------
function renderSearchBrowseTiles() {
  const grid = document.getElementById('rrCategoriesGrid');
  if (!grid) return;

  const categories = [
    { name: 'Top Hits', gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)', type: 'hits' },
    { name: 'Car Walla', gradient: 'linear-gradient(135deg, #10b981, #0d9488)', type: 'car' },
    { name: 'Bike Walla', gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)', type: 'bike' },
    { name: '90s Bollywood', gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)', filter: 'retro' },
    { name: 'Romantic Songs', gradient: 'linear-gradient(135deg, #f43f5e, #be123c)', filter: 'romantic' },
    { name: 'Evergreen Kishore', gradient: 'linear-gradient(135deg, #eab308, #ca8a04)', artist: 'kishore' }
  ];

  grid.innerHTML = categories.map(cat => `
    <div class="rr-category-tile" style="background: ${cat.gradient};" data-cat-name="${cat.name}">
      <span>${cat.name}</span>
    </div>
  `).join('');

  grid.querySelectorAll('.rr-category-tile').forEach((tile, i) => {
    tile.addEventListener('click', () => {
      const cat = categories[i];
      if (cat.type) {
        switchMusicTab(cat.type);
      } else {
        const queryInput = document.getElementById('rrSearchInput');
        if (queryInput) {
          queryInput.value = cat.name;
          handleSearchInput(cat.name);
        }
      }
    });
  });
}

let currentSearchOffset = 0;
let currentSearchResults = [];
let searchDebounceTimer = null;
let suggestionsDebounceTimer = null;

function saveRecentSearch(q) {
  if (!q || !q.trim()) return;
  const clean = q.trim();
  try {
    let recent = JSON.parse(localStorage.getItem('rr_recent_searches') || '[]');
    recent = [clean, ...recent.filter(item => item.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
    localStorage.setItem('rr_recent_searches', JSON.stringify(recent));
    renderRecentSearches();
  } catch (e) {}
}

function renderRecentSearches() {
  const container = document.getElementById('rrRecentChips');
  const row = document.getElementById('rrRecentSearchesRow');
  if (!container || !row) return;

  try {
    const recent = JSON.parse(localStorage.getItem('rr_recent_searches') || '[]');
    if (recent.length === 0) {
      row.style.display = 'none';
      return;
    }
    row.style.display = 'flex';
    container.innerHTML = recent.map(r => `
      <button class="recent-chip" type="button" data-query="${r.replace(/"/g, '&quot;')}">${r}</button>
    `).join('');

    container.querySelectorAll('.recent-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.getAttribute('data-query');
        const input = document.getElementById('rrSearchInput');
        if (input) input.value = query;
        executeDynamicSearch(query, 0, false);
      });
    });
  } catch (e) {}
}

async function fetchSuggestions(query) {
  const sugBox = document.getElementById('rrSearchSuggestions');
  if (!sugBox) return;

  if (!query || query.length < 2) {
    sugBox.style.display = 'none';
    sugBox.innerHTML = '';
    return;
  }

  try {
    const res = await fetch(`/api/music/suggestions?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        sugBox.innerHTML = data.suggestions.slice(0, 7).map(s => `
          <div class="rr-suggestion-item" data-suggestion="${s.replace(/"/g, '&quot;')}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>${s}</span>
          </div>
        `).join('');
        sugBox.style.display = 'block';

        sugBox.querySelectorAll('.rr-suggestion-item').forEach(item => {
          item.addEventListener('click', () => {
            const chosen = item.getAttribute('data-suggestion');
            const input = document.getElementById('rrSearchInput');
            if (input) input.value = chosen;
            sugBox.style.display = 'none';
            executeDynamicSearch(chosen, 0, false);
          });
        });
        return;
      }
    }
  } catch (e) {}

  sugBox.style.display = 'none';
}

function handleSearchInput(query) {
  currentSearchQuery = (query || '').trim();
  const sugBox = document.getElementById('rrSearchSuggestions');

  // Debounce autocomplete suggestions
  clearTimeout(suggestionsDebounceTimer);
  suggestionsDebounceTimer = setTimeout(() => {
    fetchSuggestions(currentSearchQuery);
  }, 160);

  // Debounce full dynamic search execution
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    executeDynamicSearch(currentSearchQuery, 0, false);
  }, 320);
}

export async function executeDynamicSearch(query, offset = 0, append = false) {
  if (typeof window !== 'undefined') {
    window.executeDynamicSearch = executeDynamicSearch;
  }
  currentSearchQuery = (query || '').trim();
  currentSearchOffset = offset;

  const browseSection = document.getElementById('rrSearchBrowseSection');
  const resultsSection = document.getElementById('rrSearchResultsSection');
  const resultsList = document.getElementById('rrSongsResultList');
  const topResultCard = document.getElementById('rrTopResultCard');
  const emptyState = document.getElementById('rrSearchEmptyState');
  const emptySpan = document.getElementById('rrEmptyQuerySpan');
  const paginationRow = document.getElementById('rrSearchPaginationRow');
  const sugBox = document.getElementById('rrSearchSuggestions');
  if (sugBox) sugBox.style.display = 'none';

  if (!currentSearchQuery) {
    if (browseSection) browseSection.style.display = 'block';
    if (resultsSection) resultsSection.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (paginationRow) paginationRow.style.display = 'none';
    renderRecentSearches();
    return;
  }

  if (browseSection) browseSection.style.display = 'none';
  if (resultsSection) resultsSection.style.display = 'block';

  if (!append) {
    saveRecentSearch(currentSearchQuery);
    if (resultsList) resultsList.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--rr-text-muted);">Searching YouTube & streaming catalogue...</div>';
  }

  try {
    const res = await fetch(`/api/music/search?q=${encodeURIComponent(currentSearchQuery)}&provider=${currentSearchProvider}&offset=${offset}&limit=20`);
    if (res.ok) {
      const data = await res.json();
      const tracks = data.tracks || [];

      if (!append) {
        currentSearchResults = tracks;
      } else {
        currentSearchResults = [...currentSearchResults, ...tracks];
      }

      if (currentSearchResults.length === 0) {
        if (topResultCard) topResultCard.innerHTML = '';
        if (resultsList) resultsList.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        if (emptySpan) emptySpan.textContent = currentSearchQuery;
        if (paginationRow) paginationRow.style.display = 'none';
        return;
      }

      if (emptyState) emptyState.style.display = 'none';

      // Render Top Result if offset 0
      if (!append && tracks.length > 0) {
        const top = tracks[0];
        if (topResultCard) {
          topResultCard.setAttribute('data-track-id', top.id || '');
          topResultCard.innerHTML = `
            <img class="top-res-art" src="${top.artwork || 'https://i.ytimg.com/vi/' + top.youtubeId + '/hqdefault.jpg'}" alt="${top.title}">
            <div class="top-res-title">${top.title}</div>
            <div class="top-res-artist">${top.artist}</div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px;">
              <span class="provider-badge ${top.provider}">${top.provider === 'spotify' ? 'Spotify' : 'YouTube Music'}</span>
              <button class="opt-play-button" type="button">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 19 12 6 20 6 4"/></svg>
                <span>${top.provider === 'spotify' ? 'Play Spotify' : 'Play Now'}</span>
              </button>
            </div>
          `;
          topResultCard.onclick = () => {
            if (top.provider === 'spotify' && top.spotifyUrl) {
              window.open(top.spotifyUrl, '_blank');
              showRadioToast(`🟢 Opening Spotify for ${top.title}`);
            } else {
              playTrack(top, currentSearchResults, 0);
            }
          };
        }
      }

      // Render Song rows
      const listTracks = append ? tracks : currentSearchResults.slice(1);
      const rowsHtml = listTracks.map((t, idx) => {
        const actualIdx = append ? (currentSearchResults.length - tracks.length + idx) : (idx + 1);
        return `
          <div class="rr-song-row" data-search-idx="${actualIdx}">
            <div class="song-row-left">
              <img class="song-row-art" src="${t.artwork || 'https://i.ytimg.com/vi/' + t.youtubeId + '/hqdefault.jpg'}" alt="${t.title}" loading="lazy">
              <div class="song-row-meta">
                <div class="song-row-title">${t.title}</div>
                <div class="song-row-artist">${t.artist}</div>
              </div>
            </div>
            <div class="song-row-right">
              <span class="provider-badge ${t.provider}">${t.provider === 'spotify' ? 'Spotify' : 'YouTube'}</span>
              <span class="song-row-dur">${t.duration || '3:30'}</span>
              <button class="song-row-play-btn" type="button" aria-label="Play ${t.title}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 19 12 6 20 6 4"/></svg>
              </button>
            </div>
          </div>
        `;
      }).join('');

      if (!append) {
        if (resultsList) resultsList.innerHTML = rowsHtml;
      } else {
        if (resultsList) resultsList.insertAdjacentHTML('beforeend', rowsHtml);
      }

      // Bind click on all song rows
      if (resultsList) {
        resultsList.querySelectorAll('.rr-song-row').forEach(row => {
          row.onclick = () => {
            const idx = parseInt(row.getAttribute('data-search-idx'), 10);
            const selected = currentSearchResults[idx];
            if (!selected) return;
            if (selected.provider === 'spotify' && selected.spotifyUrl) {
              window.open(selected.spotifyUrl, '_blank');
              showRadioToast(`🟢 Opening Spotify for ${selected.title}`);
            } else {
              playTrack(selected, currentSearchResults, idx);
            }
          };
        });
      }

      // Pagination load more button
      if (paginationRow) {
        paginationRow.style.display = data.hasMore ? 'flex' : 'none';
      }
    }
  } catch (err) {
    console.warn('[SEARCH] Dynamic search error:', err);
    if (!append && resultsList) {
      resultsList.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--rr-text-muted);">Unable to load search results. Please try again.</div>';
    }
  }
}

// --------------------------------------------------------------------------
// 7b. SPA VIEW RENDERERS (Top Hits | Car Walla | Bike Walla | Play Random | Now Playing)
// --------------------------------------------------------------------------
function renderTrackRowHtml(t, idx) {
  const isCur = currentTrack && currentTrack.id === t.id;
  return `
    <div class="rr-song-row ${isCur ? 'active' : ''}" data-track-idx="${idx}">
      <div class="song-row-left">
        <span class="song-rank" style="font-family: var(--rr-font-mono); font-size: 0.8rem; width: 24px; color: var(--rr-text-muted);">${idx + 1}</span>
        <img class="song-row-art" src="${t.artwork || 'https://i.ytimg.com/vi/' + t.youtubeId + '/hqdefault.jpg'}" alt="${t.title}" loading="lazy">
        <div class="song-row-meta">
          <div class="song-row-title">${t.title}</div>
          <div class="song-row-artist">${t.artist}</div>
        </div>
      </div>
      <div class="song-row-right">
        <span class="provider-badge ${t.provider || 'youtube'}">${t.provider === 'spotify' ? 'Spotify' : 'YouTube'}</span>
        <span class="song-row-dur">${t.duration || '3:30'}</span>
        <button class="song-row-play-btn" type="button" aria-label="Play ${t.title}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 19 12 6 20 6 4"/></svg>
        </button>
      </div>
    </div>
  `;
}

const sectionTracksCache = new Map();

async function fetchSectionTracks(section, filter = 'all') {
  const cacheKey = `${section}:${filter}`;
  if (sectionTracksCache.has(cacheKey)) {
    return sectionTracksCache.get(cacheKey);
  }

  try {
    const res = await fetch(`/api/music/section?section=${encodeURIComponent(section)}&filter=${encodeURIComponent(filter)}&limit=35`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.tracks) && data.tracks.length > 0) {
        sectionTracksCache.set(cacheKey, data.tracks);
        return data.tracks;
      }
    }
  } catch (err) {
    console.warn(`[SECTION API] Error fetching ${section}/${filter}:`, err);
  }

  // Fallback to local catalogue filter
  const config = COLLECTION_CONFIGS[section];
  if (config) {
    const fallback = catalogTracks.filter(t => config.filterFn(t, filter));
    return fallback.length > 0 ? fallback : catalogTracks.slice(0, 20);
  }
  return catalogTracks.slice(0, 20);
}

async function renderHitsView(filter = 'all') {
  const config = COLLECTION_CONFIGS.hits;
  if (!config) return;
  const listEl = document.getElementById('rrHitsTrackList');
  const filterBar = document.getElementById('rrHitsFilterBar');
  if (!listEl) return;

  if (filterBar) {
    filterBar.querySelectorAll('.col-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
      btn.onclick = () => renderHitsView(btn.getAttribute('data-filter'));
    });
  }

  const cacheKey = `hits:${filter}`;
  if (!sectionTracksCache.has(cacheKey)) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: #94A3B8;">
        <div class="live-pulse-dot" style="margin: 0 auto 12px; width: 10px; height: 10px; background: #06B6D4; box-shadow: 0 0 14px #06B6D4;"></div>
        <div style="font-size: 0.95rem; font-weight: 600; color: #FFFFFF;">Loading Top Trending YouTube Hits...</div>
        <div style="font-size: 0.8rem; margin-top: 4px;">Connecting to live music streaming catalogue</div>
      </div>
    `;
  }

  const activeTracks = await fetchSectionTracks('hits', filter);
  listEl.innerHTML = activeTracks.map((t, idx) => renderTrackRowHtml(t, idx)).join('');
  listEl.querySelectorAll('.rr-song-row').forEach(row => {
    row.onclick = () => {
      const idx = parseInt(row.getAttribute('data-track-idx'), 10);
      playTrack(activeTracks[idx], activeTracks, idx);
    };
  });

  const playAllBtn = document.getElementById('rrHitsPlayAllBtn');
  const shuffleBtn = document.getElementById('rrHitsShuffleBtn');
  if (playAllBtn) playAllBtn.onclick = () => {
    if (activeTracks.length > 0) playTrack(activeTracks[0], activeTracks, 0);
  };
  if (shuffleBtn) shuffleBtn.onclick = () => {
    if (activeTracks.length > 0) {
      const rand = Math.floor(Math.random() * activeTracks.length);
      isShuffle = true;
      playTrack(activeTracks[rand], activeTracks, rand);
    }
  };
}

async function renderCarView(filter = 'all') {
  const config = COLLECTION_CONFIGS.car;
  if (!config) return;
  const listEl = document.getElementById('rrCarTrackList');
  const filterBar = document.getElementById('rrCarFilterBar');
  if (!listEl) return;

  if (filterBar) {
    filterBar.querySelectorAll('.col-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
      btn.onclick = () => renderCarView(btn.getAttribute('data-filter'));
    });
  }

  const cacheKey = `car:${filter}`;
  if (!sectionTracksCache.has(cacheKey)) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: #94A3B8;">
        <div class="live-pulse-dot" style="margin: 0 auto 12px; width: 10px; height: 10px; background: #06B6D4; box-shadow: 0 0 14px #06B6D4;"></div>
        <div style="font-size: 0.95rem; font-weight: 600; color: #FFFFFF;">Loading Car Walla Highway Vibes...</div>
        <div style="font-size: 0.8rem; margin-top: 4px;">Curating bass, engine beats & road trip tracks</div>
      </div>
    `;
  }

  const activeTracks = await fetchSectionTracks('car', filter);
  listEl.innerHTML = activeTracks.map((t, idx) => renderTrackRowHtml(t, idx)).join('');
  listEl.querySelectorAll('.rr-song-row').forEach(row => {
    row.onclick = () => {
      const idx = parseInt(row.getAttribute('data-track-idx'), 10);
      playTrack(activeTracks[idx], activeTracks, idx);
    };
  });

  const playAllBtn = document.getElementById('rrCarPlayAllBtn');
  const shuffleBtn = document.getElementById('rrCarShuffleBtn');
  if (playAllBtn) playAllBtn.onclick = () => {
    if (activeTracks.length > 0) playTrack(activeTracks[0], activeTracks, 0);
  };
  if (shuffleBtn) shuffleBtn.onclick = () => {
    if (activeTracks.length > 0) {
      const rand = Math.floor(Math.random() * activeTracks.length);
      isShuffle = true;
      playTrack(activeTracks[rand], activeTracks, rand);
    }
  };
}

async function renderBikeView(filter = 'all') {
  const config = COLLECTION_CONFIGS.bike;
  if (!config) return;
  const listEl = document.getElementById('rrBikeTrackList');
  const filterBar = document.getElementById('rrBikeFilterBar');
  if (!listEl) return;

  if (filterBar) {
    filterBar.querySelectorAll('.col-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
      btn.onclick = () => renderBikeView(btn.getAttribute('data-filter'));
    });
  }

  const cacheKey = `bike:${filter}`;
  if (!sectionTracksCache.has(cacheKey)) {
    listEl.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: #94A3B8;">
        <div class="live-pulse-dot" style="margin: 0 auto 12px; width: 10px; height: 10px; background: #06B6D4; box-shadow: 0 0 14px #06B6D4;"></div>
        <div style="font-size: 0.95rem; font-weight: 600; color: #FFFFFF;">Loading Bike Walla Adrenaline Anthems...</div>
        <div style="font-size: 0.8rem; margin-top: 4px;">High-octane motorcycle & rider rhythms</div>
      </div>
    `;
  }

  const activeTracks = await fetchSectionTracks('bike', filter);
  listEl.innerHTML = activeTracks.map((t, idx) => renderTrackRowHtml(t, idx)).join('');
  listEl.querySelectorAll('.rr-song-row').forEach(row => {
    row.onclick = () => {
      const idx = parseInt(row.getAttribute('data-track-idx'), 10);
      playTrack(activeTracks[idx], activeTracks, idx);
    };
  });

  const playAllBtn = document.getElementById('rrBikePlayAllBtn');
  const shuffleBtn = document.getElementById('rrBikeShuffleBtn');
  if (playAllBtn) playAllBtn.onclick = () => {
    if (activeTracks.length > 0) playTrack(activeTracks[0], activeTracks, 0);
  };
  if (shuffleBtn) shuffleBtn.onclick = () => {
    if (activeTracks.length > 0) {
      const rand = Math.floor(Math.random() * activeTracks.length);
      isShuffle = true;
      playTrack(activeTracks[rand], activeTracks, rand);
    }
  };
}

let currentRandomCategory = 'all';

async function playCategoryRandom(cat = 'all') {
  currentRandomCategory = cat;
  try {
    const res = await fetch(`/api/music/section?section=random&filter=${encodeURIComponent(cat)}&limit=30`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.tracks) && data.tracks.length > 0) {
        const randIdx = Math.floor(Math.random() * data.tracks.length);
        isShuffle = true;
        playTrack(data.tracks[randIdx], data.tracks, randIdx);
        renderRandomQueueList(data.tracks);
        showRadioToast(`🔀 Smart Shuffle: ${data.tracks[randIdx].title}`);
        return;
      }
    }
  } catch (e) {}

  // Local fallback
  playSmartRandom();
  renderRandomQueueList();
}

function renderRandomQueueList(customTracks = null) {
  const container = document.getElementById('rrRandomQueueList');
  if (!container) return;

  const tracks = customTracks || (playbackQueue.length > 0 ? playbackQueue : catalogTracks.slice(0, 15));
  container.innerHTML = tracks.map((t, idx) => renderTrackRowHtml(t, idx)).join('');
  container.querySelectorAll('.rr-song-row').forEach(row => {
    row.onclick = () => {
      const idx = parseInt(row.getAttribute('data-track-idx'), 10);
      playTrack(tracks[idx], tracks, idx);
    };
  });
}

// ==========================================================================
// 7.5 SYNCHRONIZED REAL-TIME LYRICS ENGINE & PROCEDURAL GENERATOR
// ==========================================================================
const CURATED_LYRICS_DB = {
  // Blinding Lights - The Weeknd
  'kPa7bsKwL-c': [
    { time: 0, text: '♪ (Synthwave Instrumental Intro) ♪' },
    { time: 14.5, text: "Yeah, I've been tryna call" },
    { time: 19.0, text: "I've been on my own for long enough" },
    { time: 23.5, text: "Maybe you can show me how to love, maybe" },
    { time: 30.0, text: "I'm going through withdrawals" },
    { time: 34.5, text: "You don't even have to do too much" },
    { time: 39.0, text: "You can turn me on with just a touch, baby" },
    { time: 45.5, text: "I look around and Sin City's cold and empty" },
    { time: 51.0, text: "No one's around to judge me" },
    { time: 54.0, text: "I can't see clearly when you're gone" },
    { time: 58.5, text: "I said, ooh, I'm blinded by the lights" },
    { time: 66.0, text: "No, I can't sleep until I feel your touch" },
    { time: 73.5, text: "I said, ooh, I'm drowning in the night" },
    { time: 81.0, text: "Oh, when I'm like this, you're the one I trust" },
    { time: 89.0, text: "♪ (Synth Solo & Beat Drop) ♪" },
    { time: 103.0, text: "I'm running out of time" },
    { time: 107.5, text: "'Cause I can see the sun light up the sky" },
    { time: 112.0, text: "So I hit the road in overdrive, baby" },
    { time: 118.5, text: "The city's cold and empty" },
    { time: 124.0, text: "No one's around to judge me" },
    { time: 127.0, text: "I can't see clearly when you're gone" },
    { time: 131.5, text: "I said, ooh, I'm blinded by the lights" },
    { time: 139.0, text: "No, I can't sleep until I feel your touch" },
    { time: 146.5, text: "I said, ooh, I'm drowning in the night" },
    { time: 154.0, text: "Oh, when I'm like this, you're the one I trust" },
    { time: 164.0, text: "I'm just walking by to let you know" },
    { time: 171.0, text: "I could never say it on the phone" },
    { time: 177.0, text: "Will never let you go this time" },
    { time: 184.0, text: "I said, ooh, I'm blinded by the lights" },
    { time: 192.0, text: "No, I can't sleep until I feel your touch" },
    { time: 202.0, text: "♪ (Synthwave Outro Fade) ♪" }
  ],
  // Kesariya - Arijit Singh
  'BddP6PYo2gs': [
    { time: 0, text: '♪ (Sufi Acoustic Guitar & Flute Prelude) ♪' },
    { time: 14.0, text: "Mujhko itna bataye koi" },
    { time: 20.0, text: "Kaise tujhse dil na lagaye koi" },
    { time: 26.5, text: "Rabba ne tujhko banane mein" },
    { time: 33.0, text: "Kar di hai husn ki khaali tijoriyan" },
    { time: 39.5, text: "Kaajal ki siyaahi se likhi" },
    { time: 46.0, text: "Hai tune jaane kitno ki love storiyan" },
    { time: 51.5, text: "Kesariya tera ishq hai piya" },
    { time: 58.0, text: "Rang jaaun jo main haath lagaun" },
    { time: 64.5, text: "Din beete saara teri fikr mein" },
    { time: 71.0, text: "Rain saari teri khair manaun" },
    { time: 78.0, text: "Kesariya tera ishq hai piya" },
    { time: 84.5, text: "Rang jaaun jo main haath lagaun" },
    { time: 91.0, text: "♪ (Sitar & Acoustic Melody Solo) ♪" },
    { time: 105.0, text: "Patjhad ke mausam mein bhi phool khile" },
    { time: 112.0, text: "Tere aane se saari fiza badal gayi" },
    { time: 119.0, text: "Kaajal ki siyaahi se likhi" },
    { time: 125.0, text: "Hai tune jaane kitno ki love storiyan" },
    { time: 131.0, text: "Kesariya tera ishq hai piya" },
    { time: 137.5, text: "Rang jaaun jo main haath lagaun" },
    { time: 144.0, text: "Din beete saara teri fikr mein" },
    { time: 151.0, text: "Rain saari teri khair manaun" }
  ],
  // 295 - Sidhu Moose Wala
  'n_FCrCQ6-b4': [
    { time: 0, text: '♪ (Heavy West Coast Bassline & Horns) ♪' },
    { time: 12.0, text: "Geetkari te likhayi utte case kari jaande" },
    { time: 18.0, text: "Sach bolo tan eh shor machayi jaande" },
    { time: 24.0, text: "Nit naviyan virodhan di lehar chhad de" },
    { time: 30.0, text: "Dass bhala kithon tak aitbaar kariye" },
    { time: 36.5, text: "Dass kehde oh kanoon di kitaab ch likheya" },
    { time: 42.0, text: "Dharman de naa te lokan nu vanndiye" },
    { time: 48.0, text: "295 je laggi mud ke na aave" },
    { time: 54.0, text: "Lok darr de ne par asin sach bolange" },
    { time: 60.0, text: "Sidhu Moose Wala naam ae sun ke taan vekh" },
    { time: 68.0, text: "Sidhu Moose Wala naam ae sun ke taan vekh" }
  ],
  // Starboy - The Weeknd
  '34Na4j8AVgA': [
    { time: 0, text: '♪ (Daft Punk Electro Prelude) ♪' },
    { time: 11.0, text: "I'm tryna put you in the worst mood, ah" },
    { time: 16.5, text: "P1 cleaner than your church shoes, ah" },
    { time: 22.0, text: "Milli point two just to hurt you, ah" },
    { time: 27.5, text: "All red Lamb' just to tease you, ah" },
    { time: 33.0, text: "None of these toys on lease too, ah" },
    { time: 38.5, text: "Made your whole year in a week too, yah" },
    { time: 44.0, text: "Look what you've done" },
    { time: 49.5, text: "I'm a motherfuckin' starboy" },
    { time: 55.0, text: "Look what you've done" },
    { time: 60.5, text: "I'm a motherfuckin' starboy" }
  ],
  // Lover - Diljit Dosanjh
  'mH_LFkWxpI0': [
    { time: 0, text: '♪ (Upbeat Bhangra Pop Synths) ♪' },
    { time: 10.0, text: "Tera ni tera lover" },
    { time: 14.5, text: "Banda main tere te cover" },
    { time: 19.0, text: "Kardi ae kade haan kade naa" },
    { time: 24.0, text: "Dil mera denda ae safar" },
    { time: 29.5, text: "Ho aine sohne lagde ho" },
    { time: 34.0, text: "Kinna kardi aa pyaar dasso kiven dasiye" },
    { time: 40.0, text: "Tera ni tera lover, lover, lover" },
    { time: 45.0, text: "Dil de frame ch jadaiyan tasveeran" }
  ]
};

let currentTrackLyrics = [];
let activeLyricIndex = -1;

function generateDynamicLyrics(track) {
  const dur = track.durationSeconds || 210;
  const t = track.title || 'Music Stream';
  const a = track.artist || 'Artist';

  const step = Math.max(10, Math.floor(dur / 12));
  return [
    { time: 0, text: `♪ (Intro: ${t} — ${a}) ♪` },
    { time: Math.min(12, step), text: `Listening to the rhythm of ${t}...` },
    { time: step * 2, text: `Feel the acoustic energy and melody rising` },
    { time: step * 3, text: `♪ Verse 1 • ${a} vocals taking center stage ♪` },
    { time: step * 4, text: `Every note resonates through the speakers` },
    { time: step * 5, text: `♪ Chorus: ${t} ♪` },
    { time: step * 6, text: `Turn up the bass and let the sound take over` },
    { time: step * 7, text: `♪ Instrumental Bridge & Drum Cadence ♪` },
    { time: step * 8, text: `Singing along with ${a}...` },
    { time: step * 9, text: `♪ Climax Chorus: ${t} ♪` },
    { time: step * 10, text: `Harmonies swelling with the final crescendo` },
    { time: Math.max(dur - 15, step * 11), text: `♪ Outro: Smooth melodic fade ♪` }
  ];
}

function loadLyricsForTrack(track) {
  if (!track) return;
  activeLyricIndex = -1;
  const ytid = track.youtubeId;
  if (ytid && CURATED_LYRICS_DB[ytid]) {
    currentTrackLyrics = CURATED_LYRICS_DB[ytid];
  } else {
    currentTrackLyrics = generateDynamicLyrics(track);
  }
  renderLyricsPanel();
}

function renderLyricsPanel() {
  const list = document.getElementById('rrLyricsList');
  if (!list) return;

  if (!currentTrackLyrics || currentTrackLyrics.length === 0) {
    list.innerHTML = '<div style="color: #64748B; text-align: center; padding: 2rem;">Loading lyrics...</div>';
    return;
  }

  list.innerHTML = currentTrackLyrics.map((line, idx) => `
    <div class="rr-lyric-line ${idx === activeLyricIndex ? 'active' : ''}" data-idx="${idx}" data-time="${line.time}">
      ${line.text}
    </div>
  `).join('');

  list.querySelectorAll('.rr-lyric-line').forEach(el => {
    el.addEventListener('click', () => {
      const time = parseFloat(el.getAttribute('data-time'));
      if (!isNaN(time)) {
        seekTo(time);
        showRadioToast(`⏱️ Jumped to ${formatTime(time)}`);
      }
    });
  });
}

function syncLyrics(currentTime) {
  if (!currentTrackLyrics || currentTrackLyrics.length === 0) return;

  let newIdx = 0;
  for (let i = 0; i < currentTrackLyrics.length; i++) {
    if (currentTime >= currentTrackLyrics[i].time) {
      newIdx = i;
    } else {
      break;
    }
  }

  if (newIdx !== activeLyricIndex) {
    activeLyricIndex = newIdx;
    const currentLine = currentTrackLyrics[activeLyricIndex];

    // Update Dock lyric bar
    const dockText = document.getElementById('rrDockLyricText');
    if (dockText && currentLine) {
      dockText.textContent = currentLine.text;
    }

    // Update Dynamic Island expanded lyric ticker
    const diText = document.getElementById('diLyricText');
    if (diText && currentLine) {
      diText.textContent = currentLine.text;
    }

    // Update Now Playing panel active line class and auto-scroll
    const list = document.getElementById('rrLyricsList');
    if (list) {
      const allLines = list.querySelectorAll('.rr-lyric-line');
      allLines.forEach((el, idx) => {
        el.classList.toggle('active', idx === activeLyricIndex);
      });

      const activeEl = allLines[activeLyricIndex];
      const scrollContainer = document.getElementById('rrLyricsScrollContainer');
      if (activeEl && scrollContainer) {
        const targetScroll = activeEl.offsetTop - scrollContainer.offsetTop - (scrollContainer.clientHeight / 2) + (activeEl.clientHeight / 2);
        scrollContainer.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' });
      }
    }
  }
}

function renderNowPlayingView() {
  if (!currentTrack) {
    if (catalogTracks.length > 0) {
      currentTrack = catalogTracks[0];
    } else {
      return;
    }
  }

  renderLyricsPanel();

  const artImg = document.getElementById('rrNpArtworkImg');
  const titleEl = document.getElementById('rrNpTitle');
  const artistEl = document.getElementById('rrNpArtist');
  const curTime = document.getElementById('rrNpCurTime');
  const durTime = document.getElementById('rrNpDurTime');
  const scrubSlider = document.getElementById('rrNpScrubSlider');
  const scrubFill = document.getElementById('rrNpScrubFill');
  const playBtn = document.getElementById('rrNpPlayBtn');
  const likeBtn = document.getElementById('rrNpLikeBtn');
  const shuffleBtn = document.getElementById('rrNpShuffleBtn');
  const repeatBtn = document.getElementById('rrNpRepeatBtn');
  const badgeText = document.getElementById('rrNpBadgeText');
  const providerText = document.getElementById('rrNpProviderText');
  const extLink = document.getElementById('rrNpExternalLink');

  if (artImg) artImg.src = currentTrack.artworkHigh || currentTrack.artwork;
  if (titleEl) titleEl.textContent = currentTrack.title;
  if (artistEl) artistEl.textContent = currentTrack.artist;
  if (badgeText) badgeText.textContent = (currentTrack.album ? `PLAYING FROM ${currentTrack.album}` : 'PLAYING FROM REWIND DISCOVERY').toUpperCase();
  if (curTime) curTime.textContent = formatTime(currentTimeSec);
  if (durTime) durTime.textContent = formatTime(durationSec);

  if (scrubSlider && !scrubSlider.matches(':active')) {
    scrubSlider.max = durationSec || 100;
    scrubSlider.value = currentTimeSec;
  }
  if (scrubFill) {
    const pct = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0;
    scrubFill.style.width = `${pct}%`;
  }

  if (playBtn) {
    playBtn.innerHTML = isPlaying
      ? '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
  }
  if (likeBtn) likeBtn.classList.toggle('liked', recommendationService.isLiked(currentTrack.id));
  if (shuffleBtn) shuffleBtn.classList.toggle('active', isShuffle);
  if (repeatBtn) repeatBtn.classList.toggle('active', repeatMode !== 'off');

  if (providerText) {
    providerText.textContent = currentTrack.provider === 'spotify' ? 'Spotify Music' : 'YouTube Audio Stream';
  }
  if (extLink) {
    if (currentTrack.provider === 'spotify' && currentTrack.spotifyUrl) {
      extLink.href = currentTrack.spotifyUrl;
      extLink.textContent = 'Open in Spotify ↗';
    } else {
      extLink.href = `https://www.youtube.com/watch?v=${currentTrack.youtubeId}`;
      extLink.textContent = 'Open in YouTube ↗';
    }
  }
}

// --------------------------------------------------------------------------
// 8. YOUR LIBRARY VIEW
// --------------------------------------------------------------------------
function renderLibraryView() {
  const likedList = document.getElementById('rrLibraryLikedList');
  const likedEmpty = document.getElementById('rrLikedEmpty');
  const likedIds = recommendationService.getLikedTrackIds();
  const likedTracks = catalogTracks.filter(t => likedIds.includes(t.id));

  if (likedList) {
    if (likedTracks.length === 0) {
      likedList.innerHTML = '';
      if (likedEmpty) likedEmpty.style.display = 'block';
    } else {
      if (likedEmpty) likedEmpty.style.display = 'none';
      likedList.innerHTML = likedTracks.map((t, idx) => `
        <div class="rr-song-row" data-liked-idx="${idx}">
          <img class="song-thumb" src="${t.artwork}" alt="${t.title}">
          <div class="song-meta">
            <div class="song-title">${t.title}</div>
            <div class="song-artist">${t.artist}</div>
          </div>
          <span class="song-dur">${t.duration || '3:30'}</span>
        </div>
      `).join('');

      likedList.querySelectorAll('.rr-song-row').forEach(row => {
        row.addEventListener('click', () => {
          const idx = parseInt(row.getAttribute('data-liked-idx'), 10);
          playTrack(likedTracks[idx], likedTracks, idx);
        });
      });
    }
  }

  // Render History in Library
  const histList = document.getElementById('rrLibraryHistoryList');
  if (histList) {
    const history = recommendationService.getListeningHistory(catalogTracks);
    histList.innerHTML = history.slice(0, 20).map((t, idx) => `
      <div class="rr-song-row" data-hist-idx="${idx}">
        <img class="song-thumb" src="${t.artwork}" alt="${t.title}">
        <div class="song-meta">
          <div class="song-title">${t.title}</div>
          <div class="song-artist">${t.artist}</div>
        </div>
        <span class="song-dur">${t.duration || '3:30'}</span>
      </div>
    `).join('');

    histList.querySelectorAll('.rr-song-row').forEach(row => {
      row.addEventListener('click', () => {
        const idx = parseInt(row.getAttribute('data-hist-idx'), 10);
        playTrack(history[idx], history, idx);
      });
    });
  }

  updateLibraryCount();
}

function updateLibraryCount() {
  const countLabel = document.getElementById('rrLikedCountLabel');
  if (!countLabel) return;
  const likedIds = recommendationService.getLikedTrackIds();
  countLabel.textContent = `${likedIds.length} liked song${likedIds.length === 1 ? '' : 's'}`;
}

export function playLikedSongs() {
  const likedIds = recommendationService.getLikedTrackIds();
  const likedTracks = catalogTracks.filter(t => likedIds.includes(t.id));
  if (likedTracks.length > 0) {
    playTrack(likedTracks[0], likedTracks, 0);
    showRadioToast('❤️ Playing Liked Songs');
  } else {
    showRadioToast('No liked songs yet. Tap the heart on any song!');
  }
}

// --------------------------------------------------------------------------
// 9. AUDIO PLAYER ENGINE & YOUTUBE IFRAME INTEGRATION
// --------------------------------------------------------------------------
function initYouTubePlayer() {
  if (window.YT && window.YT.Player) {
    onYouTubeIframeAPIReady();
    return;
  }

  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.id = 'ytIframeScript';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  window.onYouTubeIframeAPIReady = () => {
    let hostEl = document.getElementById('rrYoutubeHost');
    if (!hostEl) {
      hostEl = document.createElement('div');
      hostEl.id = 'rrYoutubeHost';
      document.body.appendChild(hostEl);
    }

    ytPlayer = new window.YT.Player('rrYoutubeHost', {
      height: '1',
      width: '1',
      videoId: '',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError
      }
    });
  };
}

function onPlayerReady(event) {
  isPlayerReady = true;
  event.target.setVolume(currentVolume);
  if (currentTrack && isPlaying) {
    playTrack(currentTrack, playbackQueue, queueIndex);
  }
}

function onPlayerStateChange(event) {
  if (!window.YT) return;

  switch (event.data) {
    case window.YT.PlayerState.PLAYING:
      isPlaying = true;
      startProgressTicker();
      updatePlayerUIState();
      break;

    case window.YT.PlayerState.PAUSED:
      isPlaying = false;
      stopProgressTicker();
      updatePlayerUIState();
      break;

    case window.YT.PlayerState.ENDED:
      handleTrackEnded();
      break;
  }
}

function onPlayerError(event) {
  console.warn('[REWIND RADIO] YouTube Error:', event.data);
  if (currentTrack) {
    recommendationService.markTrackBroken(currentTrack.id);
  }
  showRadioToast('⚠️ Stream protected. Advancing to next track...');
  setTimeout(() => playSmartRandom(), 1000);
}

function handleTrackEnded() {
  if (currentTrack) {
    recommendationService.recordComplete(currentTrack);
  }

  if (repeatMode === 'one') {
    seekTo(0);
    if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
      ytPlayer.playVideo();
    }
    return;
  }

  if (playbackQueue.length > 0 && queueIndex + 1 < playbackQueue.length) {
    playNextTrack();
  } else {
    playSmartRandom();
  }
}

export function playTrack(track, queue = null, index = -1) {
  if (!track) return;
  currentTrack = track;

  if (queue) {
    playbackQueue = [...queue];
    queueIndex = index >= 0 ? index : playbackQueue.findIndex(t => t.id === track.id);
  } else if (!playbackQueue.some(t => t.id === track.id)) {
    playbackQueue.push(track);
    queueIndex = playbackQueue.length - 1;
  }

  updateTrackMetaUI(track);
  renderQueue();

  if (isPlayerReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    ytPlayer.loadVideoById(track.youtubeId);
    isPlaying = true;
    updatePlayerUIState();
  }

  recommendationService.recordPlay(track);
  renderRecentlyPlayed();
  updateLibraryCount();
}

export function togglePlayPause() {
  if (!isPlayerReady || !ytPlayer) {
    playSmartRandom();
    return;
  }

  if (!currentTrack && catalogTracks.length > 0) {
    playSmartRandom();
    return;
  }

  if (isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
}

export function playNextTrack() {
  if (currentTrack && currentTimeSec <= 30) {
    recommendationService.recordSkip(currentTrack, currentTimeSec);
  }

  if (playbackQueue.length === 0) {
    playSmartRandom();
    return;
  }

  let nextIdx = queueIndex + 1;
  if (isShuffle) {
    nextIdx = Math.floor(Math.random() * playbackQueue.length);
  } else if (nextIdx >= playbackQueue.length) {
    if (repeatMode === 'all') {
      nextIdx = 0;
    } else {
      playSmartRandom();
      return;
    }
  }

  playTrack(playbackQueue[nextIdx], playbackQueue, nextIdx);
}

export function playPrevTrack() {
  if (playbackQueue.length === 0) return;

  if (currentTimeSec > 3) {
    seekTo(0);
    return;
  }

  let prevIdx = queueIndex - 1;
  if (prevIdx < 0) {
    prevIdx = playbackQueue.length - 1;
  }

  playTrack(playbackQueue[prevIdx], playbackQueue, prevIdx);
}

export function seekTo(seconds) {
  currentTimeSec = Math.max(0, Math.min(seconds, durationSec));
  if (isPlayerReady && ytPlayer && typeof ytPlayer.seekTo === 'function') {
    try {
      ytPlayer.seekTo(currentTimeSec, true);
    } catch (_) {}
  }
  updateTimeDisplays();
}

export function setVolume(vol) {
  currentVolume = Math.max(0, Math.min(100, vol));
  isMuted = currentVolume === 0;
  if (isPlayerReady && ytPlayer && typeof ytPlayer.setVolume === 'function') {
    ytPlayer.setVolume(currentVolume);
  }

  const slider = document.getElementById('rrPlayerVolumeSlider');
  const fullSlider = document.getElementById('rrFullVolSlider');
  const fullFill = document.getElementById('rrFullVolFill');

  if (slider) slider.value = currentVolume;
  if (fullSlider) fullSlider.value = currentVolume;
  if (fullFill) fullFill.style.width = `${currentVolume}%`;

  savePreferences();
}

export function toggleMute() {
  isMuted = !isMuted;
  if (isPlayerReady && ytPlayer) {
    if (isMuted) {
      ytPlayer.mute();
    } else {
      ytPlayer.unMute();
      ytPlayer.setVolume(currentVolume || 70);
    }
  }
}

export function toggleShuffle() {
  isShuffle = !isShuffle;
  const btn = document.getElementById('rrPlayerShuffleBtn');
  const fullBtn = document.getElementById('rrFullShuffleBtn');
  const diBtn = document.getElementById('diShuffleBtn');

  if (btn) btn.classList.toggle('active', isShuffle);
  if (fullBtn) fullBtn.classList.toggle('active', isShuffle);
  if (diBtn) diBtn.classList.toggle('active', isShuffle);

  showRadioToast(isShuffle ? '🔀 Shuffle On' : '➡️ Shuffle Off');
  savePreferences();
}

export function cycleRepeat() {
  if (repeatMode === 'all') repeatMode = 'one';
  else if (repeatMode === 'one') repeatMode = 'off';
  else repeatMode = 'all';

  const btn = document.getElementById('rrPlayerRepeatBtn');
  const fullBtn = document.getElementById('rrFullRepeatBtn');
  const diBtn = document.getElementById('diRepeatBtn');
  const isActive = repeatMode !== 'off';

  if (btn) btn.classList.toggle('active', isActive);
  if (fullBtn) fullBtn.classList.toggle('active', isActive);
  if (diBtn) diBtn.classList.toggle('active', isActive);

  showRadioToast(`🔁 Repeat: ${repeatMode.toUpperCase()}`);
  savePreferences();
}

function startProgressTicker() {
  stopProgressTicker();
  progressTicker = setInterval(() => {
    if (!isPlayerReady || !ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
    try {
      currentTimeSec = ytPlayer.getCurrentTime() || 0;
      durationSec = ytPlayer.getDuration() || (currentTrack?.durationSeconds || 0);
      updateTimeDisplays();
    } catch (_) {}
  }, 300);
}

function stopProgressTicker() {
  if (progressTicker) {
    clearInterval(progressTicker);
    progressTicker = null;
  }
}

function updateTimeDisplays() {
  const percent = durationSec > 0 ? (currentTimeSec / durationSec) * 100 : 0;

  // Bottom Player
  const curEl = document.getElementById('rrPlayerCurTime');
  const durEl = document.getElementById('rrPlayerDurTime');
  const bar = document.getElementById('rrPlayerProgressBar');
  const fill = document.getElementById('rrPlayerProgressFill');

  if (curEl) curEl.textContent = formatTime(currentTimeSec);
  if (durEl) durEl.textContent = formatTime(durationSec);
  if (bar && !bar.matches(':active')) {
    bar.value = currentTimeSec;
    bar.max = durationSec || 100;
  }
  if (fill) fill.style.width = `${percent}%`;

  // Dynamic Island Scrub
  const diCur = document.getElementById('diCurTime');
  const diDur = document.getElementById('diDurTime');
  const diScrub = document.getElementById('diScrubSlider');
  const diFill = document.getElementById('diScrubFill');

  if (diCur) diCur.textContent = formatTime(currentTimeSec);
  if (diDur) diDur.textContent = formatTime(durationSec);
  if (diScrub && !diScrub.matches(':active')) {
    diScrub.value = currentTimeSec;
    diScrub.max = durationSec || 100;
  }
  if (diFill) diFill.style.width = `${percent}%`;

  // Full Screen Player Scrub
  const fullCur = document.getElementById('rrFullCurTime');
  const fullDur = document.getElementById('rrFullDurTime');
  const fullScrub = document.getElementById('rrFullScrubSlider');
  const fullFill = document.getElementById('rrFullScrubFill');

  if (fullCur) fullCur.textContent = formatTime(currentTimeSec);
  if (fullDur) fullDur.textContent = formatTime(durationSec);
  if (fullScrub && !fullScrub.matches(':active')) {
    fullScrub.value = currentTimeSec;
    fullScrub.max = durationSec || 100;
  }
  if (fullFill) fullFill.style.width = `${percent}%`;

  // Now Playing View Scrub
  const npCur = document.getElementById('rrNpCurTime');
  const npDur = document.getElementById('rrNpDurTime');
  const npScrub = document.getElementById('rrNpScrubSlider');
  const npFill = document.getElementById('rrNpScrubFill');

  if (npCur) npCur.textContent = formatTime(currentTimeSec);
  if (npDur) npDur.textContent = formatTime(durationSec);
  if (npScrub && !npScrub.matches(':active')) {
    npScrub.value = currentTimeSec;
    npScrub.max = durationSec || 100;
  }
  if (npFill) npFill.style.width = `${percent}%`;

  // Update Vintage Cassette Time Display
  const casTime = document.getElementById('rrCassetteTimeTag');
  if (casTime && durationSec > 0) {
    casTime.textContent = `${formatTime(currentTimeSec)} / ${formatTime(durationSec)}`;
  }

  // Real-Time Synchronized Lyrics Engine
  syncLyrics(currentTimeSec);
}

function updateTrackMetaUI(track) {
  // Bottom Player Meta
  const thumb = document.getElementById('rrPlayerThumb');
  const title = document.getElementById('rrPlayerTitle');
  const artist = document.getElementById('rrPlayerArtist');
  if (thumb) thumb.src = track.artwork;
  if (title) title.textContent = track.title;
  if (artist) artist.textContent = track.artist;

  // Dynamic Island Meta
  const diThumb = document.getElementById('diThumb');
  const diExpThumb = document.getElementById('diExpThumb');
  const diTitle = document.getElementById('diTitle');
  const diExpTitle = document.getElementById('diExpTitle');
  const diArtist = document.getElementById('diArtist');
  const diExpArtist = document.getElementById('diExpArtist');

  if (diThumb) diThumb.src = track.artwork;
  if (diExpThumb) diExpThumb.src = track.artworkHigh || track.artwork;
  if (diTitle) diTitle.textContent = track.title;
  if (diExpTitle) diExpTitle.textContent = track.title;
  if (diArtist) diArtist.textContent = track.artist;
  if (diExpArtist) diExpArtist.textContent = track.artist;

  // Vintage Cassette Centerpiece Meta
  const casImg = document.getElementById('rrCassetteAlbumImg');
  const casTitle = document.getElementById('rrCassetteTitle');
  const casArtist = document.getElementById('rrCassetteArtist');
  const casTime = document.getElementById('rrCassetteTimeTag');
  if (casImg) casImg.src = track.artworkHigh || track.artwork;
  if (casTitle) casTitle.textContent = track.title;
  if (casArtist) casArtist.textContent = track.artist;
  if (casTime) casTime.textContent = `0:00 / ${track.duration || '3:30'}`;

  // Now Playing View Meta
  const npArt = document.getElementById('rrNpArtworkImg');
  const npTitle = document.getElementById('rrNpTitle');
  const npArtist = document.getElementById('rrNpArtist');
  if (npArt) npArt.src = track.artworkHigh || track.artwork;
  if (npTitle) npTitle.textContent = track.title;
  if (npArtist) npArtist.textContent = track.artist;

  // Full Screen Player Meta
  const fullArt = document.getElementById('rrFullArtworkImg');
  const fullTitle = document.getElementById('rrFullTrackTitle');
  const fullArtist = document.getElementById('rrFullTrackArtist');

  if (fullArt) fullArt.src = track.artworkHigh || track.artwork;
  if (fullTitle) fullTitle.textContent = track.title;
  if (fullArtist) fullArtist.textContent = track.artist;

  // Load and render Synchronized Lyrics
  loadLyricsForTrack(track);

  updateAmbientColors(track);
  updatePlayerLikeState();
}

function updatePlayerLikeState() {
  if (!currentTrack) return;
  const isLiked = recommendationService.isLiked(currentTrack.id);

  const bottomLikeBtn = document.getElementById('rrPlayerLikeBtn');
  const fullLikeBtn = document.getElementById('rrFullLikeBtn');

  if (bottomLikeBtn) {
    bottomLikeBtn.classList.toggle('liked', isLiked);
    const svg = bottomLikeBtn.querySelector('svg');
    if (svg) svg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
  }

  if (fullLikeBtn) {
    fullLikeBtn.classList.toggle('liked', isLiked);
    const svg = fullLikeBtn.querySelector('svg');
    if (svg) svg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
  }
}

function updatePlayerUIState() {
  const bottomPlayBtn = document.getElementById('rrPlayerPlayBtn');
  const fullPlayBtn = document.getElementById('rrFullPlayBtn');
  const diQuickPlayBtn = document.getElementById('diQuickPlayBtn');
  const diHeroPlayBtn = document.getElementById('diHeroPlayBtn');
  const diWaveform = document.getElementById('diWaveform');
  const diWaveformLarge = document.getElementById('diWaveformLarge');

  const playSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="6 4 19 12 6 20 6 4"/></svg>';
  const pauseSvg = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  const npPlaySvg = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
  const npPauseSvg = '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
  const quickPlaySvg = '<svg class="di-quick-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 19 12 6 20 6 4"/></svg>';
  const quickPauseSvg = '<svg class="di-quick-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

  if (bottomPlayBtn) bottomPlayBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
  if (diQuickPlayBtn) diQuickPlayBtn.innerHTML = isPlaying ? quickPauseSvg : quickPlaySvg;
  if (diHeroPlayBtn) diHeroPlayBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
  const npPlayBtn = document.getElementById('rrNpPlayBtn');
  if (npPlayBtn) npPlayBtn.innerHTML = isPlaying ? npPauseSvg : npPlaySvg;

  document.body.classList.toggle('rr-audio-playing', isPlaying);

  if (diWaveform) diWaveform.classList.toggle('playing', isPlaying);
  if (diWaveformLarge) diWaveformLarge.classList.toggle('playing', isPlaying);

  // Cassette & Dynamic Island spinning reel animation
  const casShell = document.getElementById('rrCassetteShell');
  const casContainer = document.getElementById('rrCassetteContainer');
  const island = document.getElementById('rrDynamicIsland');
  if (casShell) casShell.classList.toggle('is-playing', isPlaying);
  if (casContainer) casContainer.classList.toggle('is-playing', isPlaying);
  if (island) island.classList.toggle('is-playing', isPlaying);
}

function renderQueue() {
  const container = document.getElementById('rrQueueList');
  if (!container) return;

  container.innerHTML = playbackQueue.map((t, idx) => `
    <div class="queue-track-item ${idx === queueIndex ? 'active' : ''}" data-queue-idx="${idx}">
      <img class="queue-thumb" src="${t.artwork}" alt="${t.title}">
      <div class="queue-meta">
        <div class="queue-title">${t.title}</div>
        <div class="queue-artist">${t.artist}</div>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.queue-track-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.getAttribute('data-queue-idx'), 10);
      playTrack(playbackQueue[idx], playbackQueue, idx);
    });
  });
}

function savePreferences() {
  setStorage(STORAGE_KEYS.PREFS, {
    volume: currentVolume,
    isShuffle,
    repeatMode
  });
}

function loadPreferences() {
  const prefs = getStorage(STORAGE_KEYS.PREFS, { volume: 80, isShuffle: false, repeatMode: 'all' });
  currentVolume = prefs.volume ?? 80;
  isShuffle = prefs.isShuffle ?? false;
  repeatMode = prefs.repeatMode ?? 'all';

  const shuffleBtn = document.getElementById('rrPlayerShuffleBtn');
  if (shuffleBtn) shuffleBtn.classList.toggle('active', isShuffle);

  const repeatBtn = document.getElementById('rrPlayerRepeatBtn');
  if (repeatBtn) repeatBtn.classList.toggle('active', repeatMode !== 'off');
}

// --------------------------------------------------------------------------
// 10. REAL-TIME ACTIVE LISTENERS (WEBSOCKET PRESENCE)
// --------------------------------------------------------------------------
function updatePresencePill({ status, count = 0 }) {
  const pill = document.getElementById('rrListenerPill');
  const countEl = document.getElementById('rrListenerCount');
  if (!pill || !countEl) return;

  pill.classList.remove('connecting', 'offline');

  if (status === 'connecting') {
    pill.classList.add('connecting');
    countEl.textContent = '🟢 Connecting...';
  } else if (status === 'offline') {
    pill.classList.add('offline');
    countEl.textContent = '⚪ Radio Standby';
  } else {
    countEl.textContent = count === 1 ? '🟢 1 listening now' : `🟢 ${count} listening now`;
  }
}

function initRealtimePresence() {
  if (presenceSocket && (presenceSocket.readyState === WebSocket.OPEN || presenceSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  updatePresencePill({ status: 'connecting' });

  const isHttps = window.location.protocol === 'https:';
  const wsHost = window.location.host || 'localhost:3000';
  const wsUrl = `${isHttps ? 'wss:' : 'ws:'}//${wsHost}/ws/presence?sessionId=${encodeURIComponent(sessionId)}`;

  try {
    presenceSocket = new WebSocket(wsUrl);

    presenceSocket.onopen = () => {
      reconnectAttempts = 0;
      presenceSocket.send(JSON.stringify({ type: 'init', sessionId }));

      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (presenceSocket && presenceSocket.readyState === WebSocket.OPEN) {
          presenceSocket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 20000);
    };

    presenceSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'presence' || data.type === 'welcome') {
          if (typeof data.activeListeners === 'number') {
            updatePresencePill({ status: 'connected', count: data.activeListeners });
          }
        }
      } catch (_) {}
    };

    presenceSocket.onclose = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      updatePresencePill({ status: 'offline' });

      reconnectAttempts++;
      const delay = Math.min(30000, 1000 * Math.pow(1.5, reconnectAttempts));
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => initRealtimePresence(), delay);
    };
  } catch (_) {
    updatePresencePill({ status: 'offline' });
    fetch('/api/presence')
      .then(r => r.json())
      .then(d => {
        if (d && typeof d.activeListeners === 'number') {
          updatePresencePill({ status: 'connected', count: d.activeListeners });
        }
      })
      .catch(() => {});
  }
}

// --------------------------------------------------------------------------
// 12. FLOATING RANDOM INSPIRATIONAL DESK NOTE ENGINE
// --------------------------------------------------------------------------
export function initInspirationalMessageNote() {
  const noteEl = document.getElementById('rrMessageNote');
  const textEl = document.getElementById('rrNoteText');
  const catEl = document.getElementById('rrNoteCategory');
  const nextBtn = document.getElementById('rrNoteNextBtn');

  if (!noteEl || !textEl || !catEl) return;

  function displayNextMessage(isManual = false) {
    const msg = messageEngine.getRandomMessage();
    if (!msg) return;

    // Smooth transition
    textEl.style.opacity = '0';
    textEl.style.transform = 'translateY(-6px) rotate(-1deg)';

    setTimeout(() => {
      textEl.textContent = msg.text;
      catEl.textContent = `✦ ${msg.category.toUpperCase()}`;
      textEl.style.opacity = '1';
      textEl.style.transform = 'translateY(0) rotate(0)';
      if (isManual) {
        showRadioToast(`✨ Inspiration: ${msg.category}`);
      }
    }, 180);
  }

  // Set initial random message on load
  const initial = messageEngine.getCurrentMessage();
  if (initial) {
    textEl.textContent = initial.text;
    catEl.textContent = `✦ ${initial.category.toUpperCase()}`;
  }

  // Auto-rotate every 14 seconds (within 12-18s range)
  if (messageRotateTimer) clearInterval(messageRotateTimer);
  messageRotateTimer = setInterval(() => {
    displayNextMessage(false);
  }, 14000);

  // Manual next click
  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      displayNextMessage(true);
    });
  }

  // Tap note anywhere to cycle
  noteEl.addEventListener('click', () => {
    displayNextMessage(true);
  });
}

// --------------------------------------------------------------------------
// 11. INITIALIZATION & EVENT BINDINGS
// --------------------------------------------------------------------------
export async function initRewindRadio() {
  console.log('[REWIND RADIO] Initializing Apple Liquid Glass & Dynamic Island Music Experience...');

  try {
    const res = await fetch('rewind_tracks.json');
    if (res.ok) {
      catalogTracks = await res.json();
    }
  } catch (err) {
    console.warn('[REWIND RADIO] Error fetching tracks:', err);
  }

  updateContextualGreeting();
  initRealtimePresence();
  initYouTubePlayer();
  loadPreferences();

  // Render Homepage Initial States
  renderRecentlyPlayed();
  renderSearchBrowseTiles();
  updateLibraryCount();

  // Initialize Floating Inspirational Desk Note Engine
  initInspirationalMessageNote();

  // Set initial default track in UI
  if (catalogTracks.length > 0) {
    const initialTrack = catalogTracks[0];
    updateTrackMetaUI(initialTrack);
    if (activeTab === 'nowplaying') {
      renderNowPlayingView();
    }
  }

  // Large Vintage Cassette Click to Play/Pause
  const casShell = document.getElementById('rrCassetteShell');
  if (casShell) {
    casShell.addEventListener('click', togglePlayPause);
  }

  // Universal Search Provider Filter Tabs (All, YouTube, Spotify)
  const pillAll = document.getElementById('rrFilterProviderAll');
  const pillYt = document.getElementById('rrFilterProviderYt');
  const pillSp = document.getElementById('rrFilterProviderSp');

  function setProvider(prov) {
    currentSearchProvider = prov;
    [pillAll, pillYt, pillSp].forEach(p => {
      if (p) p.classList.toggle('active', p.getAttribute('data-provider') === prov);
    });
    handleSearchInput(currentSearchQuery);
  }

  if (pillAll) pillAll.addEventListener('click', () => setProvider('all'));
  if (pillYt) pillYt.addEventListener('click', () => setProvider('youtube'));
  if (pillSp) pillSp.addEventListener('click', () => setProvider('spotify'));

  // Desktop Navigation Tab Click Handlers
  document.querySelectorAll('.rr-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchMusicTab(tab);
    });
  });

  // Mobile Bottom Navigation Handlers (All buttons wired dynamically via data-tab)
  document.querySelectorAll('.mob-nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = btn.getAttribute('data-tab');
      if (tab) {
        switchMusicTab(tab);
      } else if (btn.id === 'rrMobNavDownloader') {
        switchView('downloader');
      }
    });
  });

  // Switch to Downloader from Desktop Header
  const switchDownloaderBtn = document.getElementById('rrSwitchDownloaderBtn');
  if (switchDownloaderBtn) {
    switchDownloaderBtn.addEventListener('click', () => switchView('downloader'));
  }

  const brandBadge = document.getElementById('rrBrandBadge');
  if (brandBadge) {
    brandBadge.addEventListener('click', () => switchMusicTab('home'));
  }

  // Header Nav Bar Switches (Top level OMNI header)
  const navDownloader = document.getElementById('navDownloader');
  const navRewindRadio = document.getElementById('navRewindRadio');
  const navLogo = document.querySelector('.nav-logo');

  if (navDownloader) navDownloader.addEventListener('click', (e) => { e.preventDefault(); switchView('downloader'); });
  if (navRewindRadio) navRewindRadio.addEventListener('click', (e) => { e.preventDefault(); switchView('rewind'); });
  if (navLogo) navLogo.addEventListener('click', (e) => { e.preventDefault(); switchView('downloader'); });

  // Unified Route & Hash Handling (Supports Deep-Linking & No-Reload SPA)
  function handleRoute() {
    const hash = window.location.hash || '';
    if (hash.startsWith('#rewind')) {
      switchView('rewind');
      const parts = hash.split('/');
      const subTab = parts[1] || 'home';
      if (SPA_VIEWS[subTab]) {
        switchMusicTab(subTab, { pushHash: false });
      } else {
        switchMusicTab('home', { pushHash: false });
      }
    } else {
      switchView('downloader');
    }
  }

  handleRoute();
  window.addEventListener('hashchange', handleRoute);

  // ------------------------------------------------------------------------
  // DYNAMIC ISLAND INTERACTIONS (EXPAND / COLLAPSE / KEYBOARD / STOP PROPAGATION)
  // ------------------------------------------------------------------------
  const island = document.getElementById('rrDynamicIsland');
  const diQuickPlayBtn = document.getElementById('diQuickPlayBtn');
  const diCollapseBtn = document.getElementById('diCollapseBtn');
  const diQueueToggleBtn = document.getElementById('diQueueToggleBtn');
  const diHeroPlayBtn = document.getElementById('diHeroPlayBtn');
  const diPrevBtn = document.getElementById('diPrevBtn');
  const diNextBtn = document.getElementById('diNextBtn');
  const diShuffleBtn = document.getElementById('diShuffleBtn');
  const diRepeatBtn = document.getElementById('diRepeatBtn');
  const diScrubSlider = document.getElementById('diScrubSlider');

  if (island) {
    island.addEventListener('click', (e) => {
      if (e.target.closest('#diQuickPlayBtn') ||
          e.target.closest('#diHeroPlayBtn') ||
          e.target.closest('#diPrevBtn') ||
          e.target.closest('#diNextBtn') ||
          e.target.closest('#diShuffleBtn') ||
          e.target.closest('#diRepeatBtn') ||
          e.target.closest('#diScrubSlider') ||
          e.target.closest('#diQueueToggleBtn') ||
          e.target.closest('#diExpThumb') ||
          e.target.closest('#diLyricTicker')) {
        return;
      }

      if (!isDynamicIslandExpanded) {
        expandDynamicIsland();
      } else {
        if (e.target.closest('#diCollapseBtn') || e.target.closest('#diExpTopBar')) {
          collapseDynamicIsland();
        }
      }
    });

    // Keyboard Accessibility: Enter or Space toggles expansion
    island.addEventListener('keydown', (e) => {
      if (e.target === island && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        toggleDynamicIsland();
      }
    });
  }

  // Prevent event bubbling on interactive children inside expanded island
  const stopProp = (el) => {
    if (el) el.addEventListener('click', (e) => e.stopPropagation());
  };
  stopProp(diQuickPlayBtn);
  stopProp(diHeroPlayBtn);
  stopProp(diPrevBtn);
  stopProp(diNextBtn);
  stopProp(diShuffleBtn);
  stopProp(diRepeatBtn);
  stopProp(diScrubSlider);
  stopProp(diQueueToggleBtn);

  const diExpThumb = document.getElementById('diExpThumb');
  if (diExpThumb) {
    diExpThumb.addEventListener('click', (e) => {
      e.stopPropagation();
      switchMusicTab('nowplaying');
    });
  }

  const diLyricTicker = document.getElementById('diLyricTicker');
  if (diLyricTicker) {
    diLyricTicker.addEventListener('click', (e) => {
      e.stopPropagation();
      switchMusicTab('nowplaying');
    });
  }

  const dockLyricBar = document.getElementById('rrDockLyricBar');
  if (dockLyricBar) {
    dockLyricBar.addEventListener('click', (e) => {
      e.stopPropagation();
      switchMusicTab('nowplaying');
    });
  }

  if (diQuickPlayBtn) {
    diQuickPlayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlayPause();
    });
  }

  if (diCollapseBtn) {
    diCollapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      collapseDynamicIsland();
    });
  }

  if (diHeroPlayBtn) diHeroPlayBtn.addEventListener('click', togglePlayPause);
  if (diPrevBtn) diPrevBtn.addEventListener('click', playPrevTrack);
  if (diNextBtn) diNextBtn.addEventListener('click', playNextTrack);
  if (diShuffleBtn) diShuffleBtn.addEventListener('click', toggleShuffle);
  if (diRepeatBtn) diRepeatBtn.addEventListener('click', cycleRepeat);

  if (diScrubSlider) {
    diScrubSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const curEl = document.getElementById('diCurTime');
      if (curEl) curEl.textContent = formatTime(val);
    });
    diScrubSlider.addEventListener('change', (e) => {
      seekTo(parseFloat(e.target.value));
    });
  }

  // Collapse Dynamic Island on outside click via pointerdown (prevents bubbling race conditions)
  document.addEventListener('pointerdown', (e) => {
    if (isDynamicIslandExpanded && island && !island.contains(e.target)) {
      collapseDynamicIsland();
    }
  });

  // ------------------------------------------------------------------------
  // FOUR MAIN DISCOVERY CARDS ON HOMEPAGE
  // ------------------------------------------------------------------------
  const cardRandom = document.getElementById('rrCardPlayRandom');
  const cardHits = document.getElementById('rrCardTopHits');
  const cardCar = document.getElementById('rrCardCarWalla');
  const cardBike = document.getElementById('rrCardBikeWalla');

  if (cardRandom) {
    cardRandom.addEventListener('click', () => {
      switchMusicTab('random');
      playCategoryRandom('all');
    });
  }
  if (cardHits) cardHits.addEventListener('click', () => switchMusicTab('hits'));
  if (cardCar) cardCar.addEventListener('click', () => switchMusicTab('car'));
  if (cardBike) cardBike.addEventListener('click', () => switchMusicTab('bike'));

  // ------------------------------------------------------------------------
  // RANDOM VIEW INTERACTIVE CATEGORY CARDS
  // ------------------------------------------------------------------------
  document.querySelectorAll('.rr-random-cat-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.rr-random-cat-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const cat = card.getAttribute('data-random-cat') || 'all';
      playCategoryRandom(cat);
    });
  });

  const randomLaunchBtn = document.getElementById('rrRandomLaunchBtn');
  if (randomLaunchBtn) {
    randomLaunchBtn.addEventListener('click', () => {
      const activeCard = document.querySelector('.rr-random-cat-card.active');
      const cat = activeCard ? activeCard.getAttribute('data-random-cat') : 'all';
      playCategoryRandom(cat);
    });
  }

  // ------------------------------------------------------------------------
  // NOW PLAYING VIEW INTERACTION
  // ------------------------------------------------------------------------
  const npBackBtn = document.getElementById('rrNpBackBtn');
  const npPlayBtn = document.getElementById('rrNpPlayBtn');
  const npPrevBtn = document.getElementById('rrNpPrevBtn');
  const npNextBtn = document.getElementById('rrNpNextBtn');
  const npShuffleBtn = document.getElementById('rrNpShuffleBtn');
  const npRepeatBtn = document.getElementById('rrNpRepeatBtn');
  const npLikeBtn = document.getElementById('rrNpLikeBtn');
  const npScrubSlider = document.getElementById('rrNpScrubSlider');
  const npQueueBtn = document.getElementById('rrNpQueueBtn');

  const npMobileLyricsToggle = document.getElementById('rrNpMobileLyricsToggle');

  if (npBackBtn) npBackBtn.addEventListener('click', () => switchMusicTab(lastActiveTab || 'home'));
  if (npMobileLyricsToggle) {
    npMobileLyricsToggle.addEventListener('click', () => {
      const npLayout = document.querySelector('.rr-np-layout');
      const npWrapper = document.querySelector('.rr-nowplaying-wrapper');
      if (npLayout) {
        const isShowing = npLayout.classList.toggle('mobile-lyrics-open');
        if (npWrapper) npWrapper.classList.toggle('show-lyrics', isShowing);
        npMobileLyricsToggle.classList.toggle('active', isShowing);
      }
    });
  }
  if (npPlayBtn) npPlayBtn.addEventListener('click', togglePlayPause);
  if (npPrevBtn) npPrevBtn.addEventListener('click', playPrevTrack);
  if (npNextBtn) npNextBtn.addEventListener('click', playNextTrack);
  if (npShuffleBtn) npShuffleBtn.addEventListener('click', toggleShuffle);
  if (npRepeatBtn) npRepeatBtn.addEventListener('click', cycleRepeat);
  if (npQueueBtn) npQueueBtn.addEventListener('click', () => toggleQueue());

  if (npLikeBtn) {
    npLikeBtn.addEventListener('click', () => {
      if (!currentTrack) return;
      const isNowLiked = recommendationService.toggleLike(currentTrack.id);
      updatePlayerLikeState();
      updateLibraryCount();
      renderNowPlayingView();
      showRadioToast(isNowLiked ? '❤️ Added to Liked Songs' : '🤍 Removed from Liked Songs');
    });
  }

  if (npScrubSlider) {
    npScrubSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const curEl = document.getElementById('rrNpCurTime');
      if (curEl) curEl.textContent = formatTime(val);
    });
    npScrubSlider.addEventListener('change', (e) => {
      seekTo(parseFloat(e.target.value));
    });
  }

  // Search Load More Pagination
  const searchLoadMoreBtn = document.getElementById('rrSearchLoadMoreBtn');
  if (searchLoadMoreBtn) {
    searchLoadMoreBtn.addEventListener('click', () => {
      executeDynamicSearch(currentSearchQuery, currentSearchOffset + 20, true);
    });
  }

  // ------------------------------------------------------------------------
  // COLLECTION SHEET MODAL
  // ------------------------------------------------------------------------
  const sheetCloseBtn = document.getElementById('rrSheetCloseBtn');
  const sheetBackdrop = document.getElementById('rrSheetBackdrop');
  const sheetPlayAllBtn = document.getElementById('rrSheetPlayAllBtn');
  const sheetShuffleBtn = document.getElementById('rrSheetShuffleBtn');

  if (sheetCloseBtn) sheetCloseBtn.addEventListener('click', closeCollectionSheet);
  if (sheetBackdrop) sheetBackdrop.addEventListener('click', closeCollectionSheet);

  if (sheetPlayAllBtn) {
    sheetPlayAllBtn.addEventListener('click', () => {
      if (currentCollectionTracks.length > 0) {
        playTrack(currentCollectionTracks[0], currentCollectionTracks, 0);
        closeCollectionSheet();
        showRadioToast(`▶ Playing: ${currentCollectionTracks[0].title}`);
      }
    });
  }

  if (sheetShuffleBtn) {
    sheetShuffleBtn.addEventListener('click', () => {
      if (currentCollectionTracks.length > 0) {
        const randIdx = Math.floor(Math.random() * currentCollectionTracks.length);
        isShuffle = true;
        const shufBtn = document.getElementById('rrPlayerShuffleBtn');
        if (shufBtn) shufBtn.classList.add('active');
        playTrack(currentCollectionTracks[randIdx], currentCollectionTracks, randIdx);
        closeCollectionSheet();
        showRadioToast(`🔀 Shuffled: ${currentCollectionTracks[randIdx].title}`);
      }
    });
  }

  // ------------------------------------------------------------------------
  // FULL SCREEN PLAYER MODAL / NOW PLAYING PAGE
  // ------------------------------------------------------------------------
  const openFullPlayer = () => {
    switchView('rewind');
    switchMusicTab('nowplaying');
    window.scrollTo(0, 0);
  };

  const bottomPlayer = document.getElementById('rrBottomPlayer');
  if (bottomPlayer) {
    bottomPlayer.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
      openFullPlayer();
    });
  }

  const playerLeft = document.getElementById('rrPlayerLeft');
  const playerExpandBtn = document.getElementById('rrPlayerExpandBtn');
  if (playerLeft) {
    playerLeft.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      e.stopPropagation();
      openFullPlayer();
    });
  }
  if (playerExpandBtn) {
    playerExpandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openFullPlayer();
    });
  }


  const fullPlayBtn = document.getElementById('rrFullPlayBtn');
  const fullNextBtn = document.getElementById('rrFullNextBtn');
  const fullPrevBtn = document.getElementById('rrFullPrevBtn');
  const fullShuffleBtn = document.getElementById('rrFullShuffleBtn');
  const fullRepeatBtn = document.getElementById('rrFullRepeatBtn');
  const fullLikeBtn = document.getElementById('rrFullLikeBtn');
  const fullScrubSlider = document.getElementById('rrFullScrubSlider');
  const fullVolSlider = document.getElementById('rrFullVolSlider');
  const fullQueueToggleBtn = document.getElementById('rrFullQueueToggleBtn');

  if (fullPlayBtn) fullPlayBtn.addEventListener('click', togglePlayPause);
  if (fullNextBtn) fullNextBtn.addEventListener('click', playNextTrack);
  if (fullPrevBtn) fullPrevBtn.addEventListener('click', playPrevTrack);
  if (fullShuffleBtn) fullShuffleBtn.addEventListener('click', toggleShuffle);
  if (fullRepeatBtn) fullRepeatBtn.addEventListener('click', cycleRepeat);

  if (fullLikeBtn) {
    fullLikeBtn.addEventListener('click', () => {
      if (!currentTrack) return;
      const isNowLiked = recommendationService.toggleLike(currentTrack.id);
      updatePlayerLikeState();
      updateLibraryCount();
      showRadioToast(isNowLiked ? '❤️ Added to Liked Songs' : '🤍 Removed from Liked Songs');
    });
  }

  if (fullScrubSlider) {
    fullScrubSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const curEl = document.getElementById('rrFullCurTime');
      if (curEl) curEl.textContent = formatTime(val);
    });
    fullScrubSlider.addEventListener('change', (e) => {
      seekTo(parseFloat(e.target.value));
    });
  }

  if (fullVolSlider) {
    fullVolSlider.value = currentVolume;
    fullVolSlider.addEventListener('input', (e) => setVolume(parseInt(e.target.value, 10)));
  }

  // ------------------------------------------------------------------------
  // BOTTOM PLAYER CONTROLS
  // ------------------------------------------------------------------------
  const playerPlayBtn = document.getElementById('rrPlayerPlayBtn');
  const playerNextBtn = document.getElementById('rrPlayerNextBtn');
  const playerPrevBtn = document.getElementById('rrPlayerPrevBtn');
  const playerShuffleBtn = document.getElementById('rrPlayerShuffleBtn');
  const playerRepeatBtn = document.getElementById('rrPlayerRepeatBtn');
  const playerLikeBtn = document.getElementById('rrPlayerLikeBtn');
  const playerQueueBtn = document.getElementById('rrPlayerQueueBtn');
  const playerMuteBtn = document.getElementById('rrPlayerMuteBtn');
  const playerVolumeSlider = document.getElementById('rrPlayerVolumeSlider');
  const playerProgressBar = document.getElementById('rrPlayerProgressBar');

  if (playerPlayBtn) playerPlayBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlayPause(); });
  if (playerNextBtn) playerNextBtn.addEventListener('click', (e) => { e.stopPropagation(); playNextTrack(); });
  if (playerPrevBtn) playerPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); playPrevTrack(); });
  if (playerShuffleBtn) playerShuffleBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleShuffle(); });
  if (playerRepeatBtn) playerRepeatBtn.addEventListener('click', (e) => { e.stopPropagation(); cycleRepeat(); });

  if (playerLikeBtn) {
    playerLikeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentTrack) return;
      const isNowLiked = recommendationService.toggleLike(currentTrack.id);
      updatePlayerLikeState();
      updateLibraryCount();
      showRadioToast(isNowLiked ? '❤️ Added to Liked Songs' : '🤍 Removed from Liked Songs');
    });
  }

  if (playerVolumeSlider) {
    playerVolumeSlider.value = currentVolume;
    playerVolumeSlider.addEventListener('input', (e) => setVolume(parseInt(e.target.value, 10)));
  }

  if (playerMuteBtn) playerMuteBtn.addEventListener('click', toggleMute);

  if (playerProgressBar) {
    playerProgressBar.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const curEl = document.getElementById('rrPlayerCurTime');
      if (curEl) curEl.textContent = formatTime(val);
    });
    playerProgressBar.addEventListener('change', (e) => {
      seekTo(parseFloat(e.target.value));
    });
  }

  // ------------------------------------------------------------------------
  // QUEUE DRAWER
  // ------------------------------------------------------------------------
  const queueDrawer = document.getElementById('rrQueueDrawer');
  const queueCloseBtn = document.getElementById('rrQueueCloseBtn');
  const clearQueueBtn = document.getElementById('rrClearQueueBtn');

  const toggleQueue = () => {
    if (queueDrawer) queueDrawer.classList.toggle('open');
  };

  if (playerQueueBtn) playerQueueBtn.addEventListener('click', toggleQueue);
  if (fullQueueToggleBtn) fullQueueToggleBtn.addEventListener('click', toggleQueue);
  if (diQueueToggleBtn) diQueueToggleBtn.addEventListener('click', toggleQueue);
  if (queueCloseBtn) queueCloseBtn.addEventListener('click', () => queueDrawer?.classList.remove('open'));

  if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', () => {
      playbackQueue = currentTrack ? [currentTrack] : [];
      queueIndex = 0;
      renderQueue();
      showRadioToast('🗑️ Queue cleared');
    });
  }

  // Search input events
  const searchInput = document.getElementById('rrSearchInput');
  const searchClearBtn = document.getElementById('rrSearchClearBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const sugBox = document.getElementById('rrSearchSuggestions');
        if (sugBox) sugBox.style.display = 'none';
        executeDynamicSearch(searchInput.value, 0, false);
      }
    });
  }
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      handleSearchInput('');
    });
  }

  // Library tab filter pills
  const libPillLiked = document.getElementById('rrLibPillLiked');
  const libPillMixes = document.getElementById('rrLibPillMixes');
  const libPillHistory = document.getElementById('rrLibPillHistory');
  const libPaneLiked = document.getElementById('rrLibLikedPane');
  const libPaneMixes = document.getElementById('rrLibMixesPane');
  const libPaneHistory = document.getElementById('rrLibHistoryPane');

  const setLibTab = (tab) => {
    if (libPillLiked) libPillLiked.classList.toggle('active', tab === 'liked');
    if (libPillMixes) libPillMixes.classList.toggle('active', tab === 'mixes');
    if (libPillHistory) libPillHistory.classList.toggle('active', tab === 'history');

    if (libPaneLiked) libPaneLiked.style.display = tab === 'liked' ? 'block' : 'none';
    if (libPaneMixes) libPaneMixes.style.display = tab === 'mixes' ? 'block' : 'none';
    if (libPaneHistory) libPaneHistory.style.display = tab === 'history' ? 'block' : 'none';
  };

  if (libPillLiked) libPillLiked.addEventListener('click', () => setLibTab('liked'));
  if (libPillMixes) libPillMixes.addEventListener('click', () => setLibTab('mixes'));
  if (libPillHistory) libPillHistory.addEventListener('click', () => setLibTab('history'));

  const playLikedHeroBtn = document.getElementById('rrPlayLikedBtn');
  if (playLikedHeroBtn) playLikedHeroBtn.addEventListener('click', playLikedSongs);

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      seekTo(currentTimeSec + 10);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      seekTo(currentTimeSec - 10);
    } else if (e.code === 'Escape') {
      const collModal = document.getElementById('rrCollectionSheet');
      if (isDynamicIslandExpanded) collapseDynamicIsland();
      else if (collModal && collModal.classList.contains('open')) collModal.classList.remove('open');
      else if (queueDrawer && queueDrawer.classList.contains('open')) queueDrawer.classList.remove('open');
      else if (activeTab === 'nowplaying') switchMusicTab(lastActiveTab || 'home');
    }
  });

  // Expose methods for SPA global router and interaction
  if (typeof window !== 'undefined') {
    window.switchMusicTab = switchMusicTab;
    window.openFullPlayer = openFullPlayer;
    window.executeDynamicSearch = executeDynamicSearch;
    window.expandDynamicIsland = expandDynamicIsland;
    window.collapseDynamicIsland = collapseDynamicIsland;
    window.isDynamicIslandExpanded = () => isDynamicIslandExpanded;
  }

  console.log('[REWIND RADIO] Apple Liquid Glass UI & Dynamic Island Ready.');
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRewindRadio);
  } else {
    initRewindRadio();
  }
}
