/**
 * REWIND RADIO — Spotify-Style Recommendation & Discovery Engine
 * Multi-signal weighted scoring, user affinity profiling, and controlled randomization.
 */

export const REC_STORAGE_KEYS = {
  LIKED_SONGS: 'rewind_rec_liked_songs_v1',
  PLAY_COUNTS: 'rewind_rec_play_counts_v1',
  SKIP_COUNTS: 'rewind_rec_skip_counts_v1',
  COMPLETED_COUNTS: 'rewind_rec_completed_counts_v1',
  RECENT_TRACKS: 'rewind_rec_recent_tracks_v1',
  SEARCH_HISTORY: 'rewind_rec_search_history_v1',
  ARTIST_AFFINITY: 'rewind_rec_artist_affinity_v1',
  GENRE_AFFINITY: 'rewind_rec_genre_affinity_v1'
};

const memStorage = new Map();

function getStorage(key, fallback) {
  try {
    if (typeof localStorage !== 'undefined') {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    }
    return memStorage.has(key) ? JSON.parse(memStorage.get(key)) : fallback;
  } catch (_) {
    return fallback;
  }
}

function setStorage(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, serialized);
    } else {
      memStorage.set(key, serialized);
    }
  } catch (_) {}
}

export class RecommendationEngine {
  constructor() {
    this.brokenTrackIds = new Set();
  }

  markTrackBroken(trackId) {
    if (trackId) this.brokenTrackIds.add(trackId);
  }

  getUserProfile() {
    return {
      likedSongs: new Set(getStorage(REC_STORAGE_KEYS.LIKED_SONGS, [])),
      playCounts: getStorage(REC_STORAGE_KEYS.PLAY_COUNTS, {}),
      skipCounts: getStorage(REC_STORAGE_KEYS.SKIP_COUNTS, {}),
      completedCounts: getStorage(REC_STORAGE_KEYS.COMPLETED_COUNTS, {}),
      recentTracks: getStorage(REC_STORAGE_KEYS.RECENT_TRACKS, []),
      searchHistory: getStorage(REC_STORAGE_KEYS.SEARCH_HISTORY, []),
      artistAffinity: getStorage(REC_STORAGE_KEYS.ARTIST_AFFINITY, {}),
      genreAffinity: getStorage(REC_STORAGE_KEYS.GENRE_AFFINITY, {})
    };
  }

  isLiked(trackId) {
    const list = getStorage(REC_STORAGE_KEYS.LIKED_SONGS, []);
    return list.includes(trackId);
  }

  toggleLike(trackId) {
    let list = getStorage(REC_STORAGE_KEYS.LIKED_SONGS, []);
    let isNowLiked = false;
    if (list.includes(trackId)) {
      list = list.filter(id => id !== trackId);
      isNowLiked = false;
    } else {
      list.push(trackId);
      isNowLiked = true;
    }
    setStorage(REC_STORAGE_KEYS.LIKED_SONGS, list);

    // Update affinity weights
    const profile = this.getUserProfile();
    if (profile.artistAffinity && profile.genreAffinity) {
      // Affinity will update automatically on next play/score
    }
    return isNowLiked;
  }

  getLikedTracks(catalog) {
    const list = getStorage(REC_STORAGE_KEYS.LIKED_SONGS, []);
    return list.map(id => catalog.find(t => t.id === id)).filter(Boolean);
  }

  getLikedTrackIds() {
    return getStorage(REC_STORAGE_KEYS.LIKED_SONGS, []);
  }

  getListeningHistory(catalog = null) {
    const ids = getStorage(REC_STORAGE_KEYS.RECENT_TRACKS, []);
    if (!catalog || catalog.length === 0) {
      return ids.map(id => ({ id, title: id, artist: 'Rewind Radio', artwork: '' }));
    }
    return ids.map(id => catalog.find(t => t.id === id)).filter(Boolean);
  }

  recordPlay(track) {
    if (!track) return;
    const playCounts = getStorage(REC_STORAGE_KEYS.PLAY_COUNTS, {});
    playCounts[track.id] = (playCounts[track.id] || 0) + 1;
    setStorage(REC_STORAGE_KEYS.PLAY_COUNTS, playCounts);

    // Update Recent Tracks (max 25)
    let recent = getStorage(REC_STORAGE_KEYS.RECENT_TRACKS, []);
    recent = recent.filter(id => id !== track.id);
    recent.unshift(track.id);
    if (recent.length > 25) recent.pop();
    setStorage(REC_STORAGE_KEYS.RECENT_TRACKS, recent);

    // Update Artist Affinity
    if (track.artist) {
      const artistMap = getStorage(REC_STORAGE_KEYS.ARTIST_AFFINITY, {});
      const primaryArtist = track.artist.split(/[,&•]/)[0].trim();
      artistMap[primaryArtist] = (artistMap[primaryArtist] || 0) + 2;
      setStorage(REC_STORAGE_KEYS.ARTIST_AFFINITY, artistMap);
    }

    // Update Genre Affinity
    if (Array.isArray(track.categories)) {
      const genreMap = getStorage(REC_STORAGE_KEYS.GENRE_AFFINITY, {});
      track.categories.forEach(cat => {
        genreMap[cat] = (genreMap[cat] || 0) + 1.5;
      });
      setStorage(REC_STORAGE_KEYS.GENRE_AFFINITY, genreMap);
    }
  }

  recordSkip(track, elapsedSec = 0) {
    if (!track) return;
    // Only penalize if skipped early (< 30s)
    if (elapsedSec <= 30) {
      const skipCounts = getStorage(REC_STORAGE_KEYS.SKIP_COUNTS, {});
      skipCounts[track.id] = (skipCounts[track.id] || 0) + 1;
      setStorage(REC_STORAGE_KEYS.SKIP_COUNTS, skipCounts);

      // Decrement artist affinity slightly
      if (track.artist) {
        const artistMap = getStorage(REC_STORAGE_KEYS.ARTIST_AFFINITY, {});
        const primaryArtist = track.artist.split(/[,&•]/)[0].trim();
        if (artistMap[primaryArtist]) {
          artistMap[primaryArtist] = Math.max(0, artistMap[primaryArtist] - 1);
          setStorage(REC_STORAGE_KEYS.ARTIST_AFFINITY, artistMap);
        }
      }
    }
  }

  recordComplete(track) {
    if (!track) return;
    const completedCounts = getStorage(REC_STORAGE_KEYS.COMPLETED_COUNTS, {});
    completedCounts[track.id] = (completedCounts[track.id] || 0) + 1;
    setStorage(REC_STORAGE_KEYS.COMPLETED_COUNTS, completedCounts);

    // Boost artist affinity
    if (track.artist) {
      const artistMap = getStorage(REC_STORAGE_KEYS.ARTIST_AFFINITY, {});
      const primaryArtist = track.artist.split(/[,&•]/)[0].trim();
      artistMap[primaryArtist] = (artistMap[primaryArtist] || 0) + 3;
      setStorage(REC_STORAGE_KEYS.ARTIST_AFFINITY, artistMap);
    }
  }

  /**
   * Multi-signal recommendation scoring algorithm:
   * Base score + Artist match + Genre match + Liked bonus + Replay bonus + Completion bonus
   * - Skip penalty - Recency fatigue + Novelty discovery bonus
   */
  scoreTrack(track, profile, isDiscoveryMode = false) {
    if (this.brokenTrackIds.has(track.id)) return -9999;

    let score = 10; // Baseline score

    const isLiked = profile.likedSongs.has(track.id);
    if (isLiked) score += 35;

    // Artist affinity match
    if (track.artist) {
      const primaryArtist = track.artist.split(/[,&•]/)[0].trim();
      const artistWeight = profile.artistAffinity[primaryArtist] || 0;
      score += Math.min(30, artistWeight * 4);
    }

    // Genre affinity match
    if (Array.isArray(track.categories)) {
      let genreSum = 0;
      track.categories.forEach(cat => {
        genreSum += profile.genreAffinity[cat] || 0;
      });
      score += Math.min(25, genreSum * 2);
    }

    // Replay bonus
    const replays = profile.playCounts[track.id] || 0;
    if (replays > 0) {
      score += Math.min(20, replays * 5);
    }

    // Completion bonus
    const completions = profile.completedCounts[track.id] || 0;
    if (completions > 0) {
      score += Math.min(15, completions * 5);
    }

    // Skip penalty
    const skips = profile.skipCounts[track.id] || 0;
    if (skips > 0) {
      score -= Math.min(50, skips * 20);
    }

    // Recency fatigue (penalize if played within last 5 tracks)
    const recentIndex = profile.recentTracks.indexOf(track.id);
    if (recentIndex !== -1 && recentIndex < 5) {
      score -= 40 - (recentIndex * 6);
    }

    // Novelty / Discovery bonus
    if (replays === 0) {
      score += isDiscoveryMode ? 30 : 12;
    }

    // Trending bonus
    if (track.isTrending) {
      score += 8;
    }

    return score;
  }

  /**
   * Controlled Randomness (Softmax sampling over top-k candidates)
   * Temperature controls balance between exploitation (high score) and exploration (novelty)
   */
  sampleTopCandidate(candidateScores, temperature = 8.0) {
    if (candidateScores.length === 0) return null;
    if (candidateScores.length === 1) return candidateScores[0].track;

    // Sort by score descending and take top 12
    const pool = [...candidateScores]
      .filter(item => item.score > -100)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (pool.length === 0) return candidateScores[0].track;

    const maxScore = pool[0].score;
    const expWeights = pool.map(item => Math.exp((item.score - maxScore) / temperature));
    const sumExp = expWeights.reduce((a, b) => a + b, 0);

    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < pool.length; i++) {
      cumulative += expWeights[i] / sumExp;
      if (rand <= cumulative) {
        return pool[i].track;
      }
    }
    return pool[0].track;
  }

  /**
   * "Discover Something New" Feature
   * 1. Retrieve eligible tracks
   * 2. Analyze listening history and preferences
   * 3. Exclude recently played tracks
   * 4. Rank candidates using recommendation signals with strong novelty bias
   * 5. Apply controlled randomness to select track
   */
  discoverSomethingNew(catalog, exclusionCount = 10) {
    if (!catalog || catalog.length === 0) return null;

    const profile = this.getUserProfile();
    const recentExclusion = new Set(profile.recentTracks.slice(0, exclusionCount));

    // Eligible candidates
    let eligible = catalog.filter(t => !this.brokenTrackIds.has(t.id) && !recentExclusion.has(t.id));

    // Fallback if catalog or unplayed pool is exhausted
    if (eligible.length === 0) {
      eligible = catalog.filter(t => !this.brokenTrackIds.has(t.id));
    }
    if (eligible.length === 0) return null;

    // Score candidates with discovery novelty bias
    const candidateScores = eligible.map(track => ({
      track,
      score: this.scoreTrack(track, profile, true)
    }));

    return this.sampleTopCandidate(candidateScores, 9.0);
  }

  /**
   * Generate "Made For You" Personalized Mix
   */
  getMadeForYou(catalog, limit = 10) {
    if (!catalog || catalog.length === 0) return [];
    const profile = this.getUserProfile();

    const scored = catalog
      .filter(t => !this.brokenTrackIds.has(t.id))
      .map(track => ({
        track,
        score: this.scoreTrack(track, profile, false) + (Math.random() * 4 - 2) // subtle jitter
      }))
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(s => s.track);
  }

  getPersonalizedRecommendations(catalog, limit = 10) {
    return this.getMadeForYou(catalog, limit);
  }

  /**
   * Generate 4 Curated Personalized Daily Mixes
   */
  getDailyMixes(catalog) {
    if (!catalog || catalog.length === 0) return [];

    const mix1Tracks = catalog.filter(t => 
      t.artist.includes('Kishore') || t.artist.includes('Rafi') || 
      t.artist.includes('Lata') || t.artist.includes('Mukesh') || t.categories.includes('Golden Era Classics')
    );

    const mix2Tracks = catalog.filter(t => 
      t.era === '90s' || t.categories.includes('90s Bollywood') || 
      t.artist.includes('Kumar Sanu') || t.artist.includes('Udit') || t.artist.includes('Alka')
    );

    const mix3Tracks = catalog.filter(t => 
      t.isTrending || t.type === 'modern' || t.categories.includes('Top Trending Mix') || 
      t.artist.includes('Arijit') || t.artist.includes('Karan Aujla') || t.artist.includes('Diljit')
    );

    const mix4Tracks = catalog.filter(t => 
      t.language === 'English' || t.categories.includes('Global English Hits') || 
      t.artist.includes('Bruno Mars') || t.artist.includes('Sabrina') || t.artist.includes('Queen')
    );

    return [
      {
        id: 'daily-mix-1',
        title: 'Daily Mix 1',
        subtitle: 'Kishore Kumar, Mohammed Rafi, Lata Mangeshkar and more golden melodies',
        accentColor: '#e89547',
        gradient: 'linear-gradient(135deg, #78350f 0%, #1f1207 100%)',
        tracks: mix1Tracks.slice(0, 15)
      },
      {
        id: 'daily-mix-2',
        title: 'Daily Mix 2',
        subtitle: 'Kumar Sanu, Udit Narayan, Alka Yagnik & 90s cassette romance',
        accentColor: '#ec4899',
        gradient: 'linear-gradient(135deg, #831843 0%, #220512 100%)',
        tracks: mix2Tracks.slice(0, 15)
      },
      {
        id: 'daily-mix-3',
        title: 'Daily Mix 3',
        subtitle: 'Arijit Singh, Karan Aujla, Diljit Dosanjh & Desi chartbusters',
        accentColor: '#3b82f6',
        gradient: 'linear-gradient(135deg, #1e3a8a 0%, #080f27 100%)',
        tracks: mix3Tracks.slice(0, 15)
      },
      {
        id: 'daily-mix-4',
        title: 'Daily Mix 4',
        subtitle: 'Lady Gaga, Bruno Mars, Sabrina Carpenter, Billie Eilish & Queen',
        accentColor: '#10b981',
        gradient: 'linear-gradient(135deg, #064e3b 0%, #021a14 100%)',
        tracks: mix4Tracks.slice(0, 15)
      }
    ];
  }

  /**
   * Fast, multi-field search across tracks, artists, movies, and categories
   */
  searchCatalog(catalog, query) {
    if (!query || !query.trim()) return [];
    const q = query.trim().toLowerCase();

    return catalog.filter(t => {
      if (t.title && t.title.toLowerCase().includes(q)) return true;
      if (t.artist && t.artist.toLowerCase().includes(q)) return true;
      if (t.movie && t.movie.toLowerCase().includes(q)) return true;
      if (t.era && t.era.toLowerCase().includes(q)) return true;
      if (Array.isArray(t.categories) && t.categories.some(c => c.toLowerCase().includes(q))) return true;
      return false;
    });
  }
}

export const recommendationService = new RecommendationEngine();
