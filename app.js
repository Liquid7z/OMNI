/**
 * OMNI UNIVERSAL DOWNLOADER — APPLICATION LOGIC
 * Interactive 3D Vinyl Experience for Multi-Platform Video & Audio Ripping
 */

// Format utilities for client-side download streamer and stats
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '00:00';
  const sec = Math.round(seconds);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// --------------------------------------------------------------------------
// 1. Platform Catalog Dataset
// --------------------------------------------------------------------------
const PLATFORMS = [
  {
    id: 'universal',
    title: 'UNIVERSAL',
    badge: 'OMNI AUTO-DETECT',
    engine: 'OmniCore AI v4.8 (Auto-Detect)',
    formats: '4K MP4 • 320k MP3 • Lossless FLAC',
    speed: 'Uncapped Turbo (10 Gbps CDN)',
    features: ['Multi-Platform Auto-Sniffer', 'Instant Video & Audio Ripping'],
    color: '#8a2be2',
    accentColor: '#00d2ff',
    placeholder: 'Paste ANY video or audio link (YouTube, Insta, Terabox, TikTok...)...',
    sampleUrl: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
    sampleTitle: 'Universal Stream Rip: 4K 60fps Video & 320k Audio',
    sampleUploader: 'Multi-Source Auto-Extractor • Gigabit Speed',
    sampleDuration: '04:12',
    reviews: [
      { publication: 'PRODUCT HUNT', quote: '“DETECTS ALMOST EVERY STREAM INSTANTLY”' },
      { publication: 'TECHRADAR', quote: '“THE ULTIMATE ALL-IN-ONE MEDIA EXTRACTOR”' }
    ]
  },
  {
    id: 'youtube',
    title: 'YOUTUBE',
    badge: '4K ULTRA HD & SHORTS',
    engine: 'DLP-Ultra Stream Engine',
    formats: '8K / 4K 60fps • 1080p • 320k MP3',
    speed: 'Multi-Threaded Direct Stream',
    features: ['4K 60FPS Video (No Desync)', 'Studio MP3 320kbps Audio'],
    color: '#ff0033',
    accentColor: '#ffffff',
    placeholder: 'Paste YouTube video, Shorts, or playlist URL...',
    sampleUrl: 'https://www.youtube.com/watch?v=kXYiU_JCYtU',
    sampleTitle: 'Linkin Park - In The End (Official 4K Remastered Video)',
    sampleUploader: 'Linkin Park Official • 1.8B Views',
    sampleDuration: '03:39',
    reviews: [
      { publication: 'DIGITAL TRENDS', quote: '“TRUE 4K 60FPS WITHOUT AUDIO DESYNC”' },
      { publication: 'SOUND ON SOUND', quote: '“STUDIO-GRADE 320KBPS MP3 RIPPING”' }
    ]
  },
  {
    id: 'instagram',
    title: 'INSTAGRAM',
    badge: 'REELS & AUDIO RIPPER',
    engine: 'InstaGraph Direct Stream v3',
    formats: '1080p Full HD MP4 • High-Res AAC',
    speed: 'Direct CDN Extraction',
    features: ['Private Reels & Stories', 'High Quality Original Audio'],
    color: '#e1306c',
    accentColor: '#f77737',
    placeholder: 'Paste Instagram Reel, Post, or Story link...',
    sampleUrl: 'https://www.instagram.com/reel/C7xY9k1P_qZ/',
    sampleTitle: 'Cinematic Tokyo Street Photography (HDR Reel)',
    sampleUploader: '@tokyo_visuals • 450K Likes',
    sampleDuration: '00:58',
    reviews: [
      { publication: 'CREATOR HUB', quote: '“BEST TOOL FOR ARCHIVING CREATOR REELS”' },
      { publication: 'THE VERGE', quote: '“FULL QUALITY AUDIO & NO METADATA LOSS”' }
    ]
  },
  {
    id: 'terabox',
    title: 'TERABOX',
    badge: 'CLOUD LINK BYPASS',
    engine: 'TeraCloud High-Speed Fetch',
    formats: 'Original Master MP4 • Direct Stream',
    speed: 'Bypasses App Limit (High Speed)',
    features: ['No Login or Client Required', 'Single Click Direct URL Generator'],
    color: '#0066ff',
    accentColor: '#00e5ff',
    placeholder: 'Paste Terabox share link (terabox.com/s/...)',
    sampleUrl: 'https://terabox.com/s/1aBcDeFgHiJkLmNoPqRsTuVw',
    sampleTitle: 'Full Course Masterclass Archive (Full 1080p HD Video)',
    sampleUploader: 'Cloud Vault Server • 1.4 GB File',
    sampleDuration: '45:10',
    reviews: [
      { publication: 'CLOUD TECH DAILY', quote: '“SKIPS APP INSTALL & DOWNLOAD LIMITS”' },
      { publication: 'XDA DEVELOPERS', quote: '“DIRECT HIGH-SPEED CLOUD RETRIEVAL”' }
    ]
  },
  {
    id: 'tiktok',
    title: 'TIKTOK',
    badge: 'WATERMARK-FREE HD',
    engine: 'TikWM Super-Speed Ripper',
    formats: '1080p No-Watermark MP4 • MP3 Sound',
    speed: 'Instant Direct CDN Grab',
    features: ['Zero Watermark or Logo Blur', 'Original Sound & Audio Track'],
    color: '#00f2fe',
    accentColor: '#fe0979',
    placeholder: 'Paste TikTok video or sound URL...',
    sampleUrl: 'https://www.tiktok.com/@scout2015/video/6718335390845095173',
    sampleTitle: 'Viral Golden Retriever ASMR & Tricks (Watermark-Free)',
    sampleUploader: '@scout2015 • 3.2M Likes',
    sampleDuration: '00:30',
    reviews: [
      { publication: 'TREND JOURNAL', quote: '“ZERO WATERMARK WITH ORIGINAL BITRATE”' },
      { publication: 'FORBES CREATORS', quote: '“THE CLEANEST TIKTOK EXTRACTOR”' }
    ]
  },
  {
    id: 'facebook',
    title: 'FACEBOOK',
    badge: 'WATCH & REELS DL',
    engine: 'MetaStream Rip v3',
    formats: '1080p Full HD MP4 • MP3 320k',
    speed: 'Unthrottled Chunk Stream',
    features: ['Public Reels & Watch Supported', 'Full FB Watch High Bitrate'],
    color: '#1877f2',
    accentColor: '#ffffff',
    placeholder: 'Paste Facebook video or Reel link...',
    sampleUrl: 'https://www.facebook.com/watch/?v=10153231379946729',
    sampleTitle: 'Facebook Official: How to Share With Just Friends',
    sampleUploader: 'Facebook Official • 2.8M Views',
    sampleDuration: '01:14',
    reviews: [
      { publication: 'WIRED', quote: '“SOLID 1080P EXTRACTION FROM FB WATCH”' },
      { publication: 'LIFEHACKER', quote: '“WORKS RELIABLY ON FB REELS TOO”' }
    ]
  },
  {
    id: 'twitter',
    title: 'TWITTER / X',
    badge: 'SPACES & CLIPS RIP',
    engine: 'X-Stream Ripper v2',
    formats: 'Original MP4 • GIF Export • M4A Spaces',
    speed: 'Instant Link Resolve',
    features: ['Twitter Spaces Audio Recording', 'Full HD Video Clips Without Compression'],
    color: '#111111',
    accentColor: '#e7e9ea',
    placeholder: 'Paste X / Twitter post or Spaces URL...',
    sampleUrl: 'https://x.com/tech_insider/status/1789012345678901234',
    sampleTitle: 'Next-Gen AI Hardware Live Demo & Spaces Q&A',
    sampleUploader: '@tech_insider • 54K Reposts',
    sampleDuration: '28:10',
    reviews: [
      { publication: 'FAST COMPANY', quote: '“RECORD FULL TWITTER SPACES WITH EASE”' },
      { publication: 'POCKET-LINT', quote: '“CLEAN MP4 EXPORTS WITHOUT COMPRESSION”' }
    ]
  },
  {
    id: 'spotify',
    title: 'SPOTIFY',
    badge: 'LOSSLESS FLAC & MP3',
    engine: 'SpotStream Lossless Audio Bridge',
    formats: '320kbps MP3 • 24-bit FLAC • ID3 Tags',
    speed: 'High-Speed Studio Ripping',
    features: ['Embedded High-Res Album Art', 'Synchronized Track & Artist Metadata'],
    color: '#1ed760',
    accentColor: '#121212',
    placeholder: 'Paste Spotify track, album, or playlist link...',
    sampleUrl: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
    sampleTitle: 'Rick Astley - Never Gonna Give You Up (Studio Master)',
    sampleUploader: 'RCA Records • 320 kbps Lossless FLAC',
    sampleDuration: '03:33',
    reviews: [
      { publication: 'AUDIOPHILE SOUND', quote: '“PRESERVES COMPLETE 24-BIT MASTER AUDIO”' },
      { publication: 'PITCHFORK', quote: '“FLAWLESS METADATA & COVER EMBEDDING”' }
    ]
  },
  {
    id: 'soundcloud',
    title: 'SOUNDCLOUD',
    badge: 'HQ AUDIO & DJ SETS',
    engine: 'CloudRip HLS Audio v4',
    formats: 'HQ 320kbps MP3 • WAV Lossless',
    speed: 'Unthrottled Stream',
    features: ['Full DJ Sets & Podcasts Supported', 'Full Dynamic Range Waveform Rip'],
    color: '#ff5500',
    accentColor: '#ffffff',
    placeholder: 'Paste SoundCloud track or set link...',
    sampleUrl: 'https://soundcloud.com/alanwalker/alan-walker-fade',
    sampleTitle: 'Alan Walker - Fade (Original Studio Master)',
    sampleUploader: 'Alan Walker • 18.8M Plays',
    sampleDuration: '04:24',
    reviews: [
      { publication: 'DJ MAG', quote: '“EXTRACTS FULL DJ SETS SEAMLESSLY”' },
      { publication: 'RESIDENT ADVISOR', quote: '“UNCOMPRESSED HIGH QUALITY SOUND”' }
    ]
  },
  {
    id: 'reddit',
    title: 'REDDIT',
    badge: 'AUDIO-SYNC V.REDD.IT',
    engine: 'Redux Video Muxer',
    formats: 'Merged 1080p MP4 with Audio',
    speed: 'Instant DASH Muxing',
    features: ['Fixes Muted v.redd.it Audio', 'Converts Reddit GIF to MP4'],
    color: '#ff4500',
    accentColor: '#ffffff',
    placeholder: 'Paste Reddit post link (reddit.com/r/...)',
    sampleUrl: 'https://www.reddit.com/r/funny/comments/1xqv37k/my_cat_watching_the_birds/',
    sampleTitle: 'My cat watching the birds outside',
    sampleUploader: 'r/funny',
    sampleDuration: '00:00',
    reviews: [
      { publication: 'REDDITOR REVIEW', quote: '“FINALLY AUDIO AND VIDEO MERGED IN SYNC”' },
      { publication: 'THE NEXT WEB', quote: '“SOLVES THE DREADED V.REDD.IT ISSUE”' }
    ]
  },
  {
    id: 'pinterest',
    title: 'PINTEREST',
    badge: 'VIDEO PINS 1080P',
    engine: 'PinFetch HD Extractor',
    formats: '1080p Full HD MP4 • High-Res JPG',
    speed: 'Instant Direct Fetch',
    features: ['Multi-Slide Idea Pins', 'Highest Source Resolution Video'],
    color: '#e60023',
    accentColor: '#ffffff',
    placeholder: 'Paste Pinterest Pin link...',
    sampleUrl: 'https://www.pinterest.com/pin/1149403436154631720/',
    sampleTitle: 'Aesthetic High-Res Wallpaper',
    sampleUploader: 'Pinterest Creator',
    sampleDuration: '00:00',
    reviews: [
      { publication: 'CREATIVE BLOQ', quote: '“SAVE DESIGN IDEAS IN HIGHEST RESOLUTION”' },
      { publication: 'DESIGN MILK', quote: '“CRYSTAL CLEAR VIDEO PIN DOWNLOADS”' }
    ]
  },
  {
    id: 'twitch',
    title: 'TWITCH',
    badge: '60FPS CLIPS & VODS',
    engine: 'TwitchForge Stream Transcoder',
    formats: 'Source 1080p 60fps MP4 • Stream Audio',
    speed: 'High-Bandwidth CDN',
    features: ['Top Clip Extractor', 'Timecode Custom Trimming'],
    color: '#9146ff',
    accentColor: '#ffffff',
    placeholder: 'Paste Twitch Clip or VOD URL...',
    sampleUrl: 'https://www.twitch.tv/videos/2290000000',
    sampleTitle: 'Live Gaming Highlights & Chat Audio (Source 60fps)',
    sampleUploader: 'Twitch Partner Stream • 60fps',
    sampleDuration: '02:45',
    reviews: [
      { publication: 'ESPORTS INSIDER', quote: '“CAPTURE SOURCE 60FPS CLIPS INSTANTLY”' },
      { publication: 'STREAMER LIFE', quote: '“HIGH BITRATE VOD DOWNLOADS WITHOUT LAG”' }
    ]
  }
];

// --------------------------------------------------------------------------
// 2. High-Resolution Dynamic Canvas Disc Artwork Generator
// --------------------------------------------------------------------------
function generatePlatformDiscCanvas(platform) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const cx = 512;
  const cy = 512;

  // 1. Vinyl Base Radial Tone
  const baseGrad = ctx.createRadialGradient(cx, cy, 140, cx, cy, 512);
  if (platform.id === 'universal') {
    baseGrad.addColorStop(0, '#1a1824');
    baseGrad.addColorStop(0.3, '#14141e');
    baseGrad.addColorStop(0.7, '#1b1328');
    baseGrad.addColorStop(1, '#0e0e14');
  } else if (platform.id === 'youtube') {
    baseGrad.addColorStop(0, '#2a0a0e');
    baseGrad.addColorStop(0.4, '#1b0609');
    baseGrad.addColorStop(0.8, '#140406');
    baseGrad.addColorStop(1, '#080102');
  } else if (platform.id === 'instagram') {
    baseGrad.addColorStop(0, '#2e0f24');
    baseGrad.addColorStop(0.4, '#240b2a');
    baseGrad.addColorStop(0.8, '#180720');
    baseGrad.addColorStop(1, '#0c0310');
  } else if (platform.id === 'terabox') {
    baseGrad.addColorStop(0, '#0a1d36');
    baseGrad.addColorStop(0.4, '#08172b');
    baseGrad.addColorStop(0.8, '#05101f');
    baseGrad.addColorStop(1, '#02060c');
  } else if (platform.id === 'tiktok') {
    baseGrad.addColorStop(0, '#10171d');
    baseGrad.addColorStop(0.4, '#0d1318');
    baseGrad.addColorStop(0.8, '#090d10');
    baseGrad.addColorStop(1, '#040608');
  } else if (platform.id === 'spotify') {
    baseGrad.addColorStop(0, '#0c2214');
    baseGrad.addColorStop(0.4, '#09190e');
    baseGrad.addColorStop(0.8, '#06110a');
    baseGrad.addColorStop(1, '#030805');
  } else {
    baseGrad.addColorStop(0, '#1a1e24');
    baseGrad.addColorStop(0.4, '#13161a');
    baseGrad.addColorStop(0.8, '#0e1013');
    baseGrad.addColorStop(1, '#060708');
  }

  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 1024, 1024);

  // 2. Realistic Concentric Vinyl Grooves
  ctx.save();
  for (let r = 160; r < 500; r += 2.5) {
    const grooveAlpha = (Math.sin(r * 0.4) * 0.5 + 0.5) * 0.08 + 0.03;
    ctx.strokeStyle = `rgba(255, 255, 255, ${grooveAlpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Platform Outer Brand Aura Ring
  ctx.save();
  const auraGrad = ctx.createLinearGradient(0, 0, 1024, 1024);
  auraGrad.addColorStop(0, platform.color);
  auraGrad.addColorStop(0.5, platform.accentColor || platform.color);
  auraGrad.addColorStop(1, platform.color);

  ctx.strokeStyle = auraGrad;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, 480, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 4. Center Platform Label Face (Radius 160 to 440)
  ctx.save();
  // Label circular backing
  const labelGrad = ctx.createRadialGradient(cx, cy, 140, cx, cy, 400);
  labelGrad.addColorStop(0, '#ffffff');
  labelGrad.addColorStop(0.7, '#f4f4f6');
  labelGrad.addColorStop(1, '#d8dbe2');

  ctx.beginPath();
  ctx.arc(cx, cy, 390, 0, Math.PI * 2);
  ctx.fillStyle = labelGrad;
  ctx.fill();

  // Inner border of label
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // 5. Draw Platform Icon & Emblems on the Label Face
  ctx.save();
  ctx.translate(cx, cy);

  if (platform.id === 'universal') {
    // Multi-color futuristic prism aura
    const prismGrad = ctx.createLinearGradient(-180, -180, 180, 180);
    prismGrad.addColorStop(0, '#8a2be2');
    prismGrad.addColorStop(0.25, '#00d2ff');
    prismGrad.addColorStop(0.5, '#00ff88');
    prismGrad.addColorStop(0.75, '#ffbb00');
    prismGrad.addColorStop(1, '#ff007f');

    ctx.strokeStyle = prismGrad;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 310, 0, Math.PI * 2);
    ctx.stroke();

    // Central Omni Bolt Symbol
    ctx.fillStyle = '#0c0c0c';
    ctx.beginPath();
    ctx.moveTo(10, -220);
    ctx.lineTo(-40, -140);
    ctx.lineTo(0, -140);
    ctx.lineTo(-10, -80);
    ctx.lineTo(40, -160);
    ctx.lineTo(0, -160);
    ctx.closePath();
    ctx.fill();

  } else if (platform.id === 'youtube') {
    // YouTube Red Play Emblem
    ctx.fillStyle = '#ff0033';
    ctx.beginPath();
    ctx.roundRect(-85, -230, 170, 115, 28);
    ctx.fill();

    // White Play Triangle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-18, -195);
    ctx.lineTo(24, -172);
    ctx.lineTo(-18, -150);
    ctx.closePath();
    ctx.fill();

  } else if (platform.id === 'instagram') {
    // Instagram Sunset Camera Glyph
    const igGrad = ctx.createLinearGradient(-70, -240, 70, -100);
    igGrad.addColorStop(0, '#f09433');
    igGrad.addColorStop(0.4, '#e6683c');
    igGrad.addColorStop(0.7, '#dc2743');
    igGrad.addColorStop(0.9, '#cc2366');
    igGrad.addColorStop(1, '#bc1888');

    ctx.strokeStyle = igGrad;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.roundRect(-70, -230, 140, 140, 36);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -160, 35, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = igGrad;
    ctx.beginPath();
    ctx.arc(38, -198, 8, 0, Math.PI * 2);
    ctx.fill();

  } else if (platform.id === 'terabox') {
    // Terabox Cloud & Fast Download Symbol
    ctx.fillStyle = '#0066ff';
    ctx.beginPath();
    ctx.arc(-25, -160, 42, 0, Math.PI * 2);
    ctx.arc(30, -165, 36, 0, Math.PI * 2);
    ctx.arc(65, -145, 26, 0, Math.PI * 2);
    ctx.roundRect(-60, -145, 140, 45, 12);
    ctx.fill();

    // Arrow down
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(10, -160);
    ctx.lineTo(10, -135);
    ctx.lineTo(24, -135);
    ctx.lineTo(0, -112);
    ctx.lineTo(-24, -135);
    ctx.lineTo(-10, -135);
    ctx.lineTo(-10, -160);
    ctx.closePath();
    ctx.fill();

  } else if (platform.id === 'tiktok') {
    // TikTok Chromatic Music Note
    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 110px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♫', -4, -168);

    ctx.fillStyle = '#fe0979';
    ctx.fillText('♫', 4, -164);

    ctx.fillStyle = '#000000';
    ctx.fillText('♫', 0, -166);

  } else if (platform.id === 'spotify') {
    // Spotify Waves
    ctx.fillStyle = '#1ed760';
    ctx.beginPath();
    ctx.arc(0, -165, 68, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#121212';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(0, -145, 45, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -148, 32, Math.PI * 1.16, Math.PI * 1.84);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, -152, 18, Math.PI * 1.14, Math.PI * 1.86);
    ctx.stroke();

  } else if (platform.id === 'twitter') {
    // Sharp Modern X
    ctx.fillStyle = '#0c0c0c';
    ctx.font = '900 110px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('𝕏', 0, -165);

  } else if (platform.id === 'facebook') {
    // Facebook "f" Watch badge
    ctx.fillStyle = '#1877f2';
    ctx.beginPath();
    ctx.arc(0, -165, 60, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 88px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('f', 12, -156);

  } else {
    // Generic high-res badge
    ctx.fillStyle = platform.color;
    ctx.beginPath();
    ctx.arc(0, -165, 55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(platform.title.slice(0, 2), 0, -165);
  }
  ctx.restore();

  // 6. Typography Printed on the Vinyl Face
  ctx.save();
  ctx.translate(cx, cy);

  // Platform Title
  ctx.fillStyle = '#0c0c0c';
  ctx.font = 'bold 56px "Inter", -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '-1px';
  ctx.fillText(platform.title, 0, 200);

  // Platform Sub-Badge
  ctx.fillStyle = '#555555';
  ctx.font = '600 22px "Inter", sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText(platform.badge, 0, 240);

  // High-End Vinyl Spec Tag
  ctx.fillStyle = '#888888';
  ctx.font = '500 17px "JetBrains Mono", monospace';
  ctx.letterSpacing = '1px';
  ctx.fillText('320 KBPS AUDIO • 4K ULTRA HD • LOSSLESS RIP', 0, 280);

  // Speed and Audio Indicator
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillText('SPEED: 10 GBPS DIRECT • STEREO MASTER', 0, 310);

  ctx.restore();

  return canvas;
}

// --------------------------------------------------------------------------
// 3. UI DOM Elements Setup & Bindings
// --------------------------------------------------------------------------
const filmTitleEl = document.getElementById('filmTitle');
const platformBadgeEl = document.getElementById('platformBadge');
const specEngineEl = document.getElementById('specEngine');
const specFormatsEl = document.getElementById('specFormats');
const specSpeedEl = document.getElementById('specSpeed');
const specFeaturesEl = document.getElementById('specFeatures');

const reviewPub1El = document.getElementById('reviewPub1');
const reviewQuote1El = document.getElementById('reviewQuote1');
const reviewPub2El = document.getElementById('reviewPub2');
const reviewQuote2El = document.getElementById('reviewQuote2');

const indexToggleBtn = document.getElementById('indexToggleBtn');
const indexDropdown = document.getElementById('indexDropdown');
const indexFilmList = document.getElementById('indexFilmList');

const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const downloadBtn = document.getElementById('downloadBtn');
const demoChips = document.querySelectorAll('.demo-chip');

const downloadModal = document.getElementById('downloadModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalLoading = document.getElementById('modalLoading');
const modalReady = document.getElementById('modalReady');
const loadingStatusText = document.getElementById('loadingStatusText');
const detectedPlatformBadge = document.getElementById('detectedPlatformBadge');
const mediaTitle = document.getElementById('mediaTitle');
const mediaUploader = document.getElementById('mediaUploader');
const mediaDurationTag = document.getElementById('mediaDurationTag');
const modalThumbCanvas = document.getElementById('modalThumbCanvas');
const toastNotification = document.getElementById('toastNotification');
const redditAuthBar = document.getElementById('redditAuthBar');
const redditAuthDot = document.getElementById('redditAuthDot');
const redditAuthText = document.getElementById('redditAuthText');

// Real-Time Download Progress & Error State DOM Elements
const modalProgressState = document.getElementById('modalProgressState');
const progressBadge = document.getElementById('progressBadge');
const progressTitle = document.getElementById('progressTitle');
const progressDesc = document.getElementById('progressDesc');
const progressBarFill = document.getElementById('progressBarFill');
const progressPercent = document.getElementById('progressPercent');
const progressSize = document.getElementById('progressSize');
const progressCancelBtn = document.getElementById('progressCancelBtn');

const modalErrorState = document.getElementById('modalErrorState');
const errorBadge = document.getElementById('errorBadge');
const errorIcon = document.getElementById('errorIcon');
const errorTitle = document.getElementById('errorTitle');
const errorDescription = document.getElementById('errorDescription');
const errorSolutionBox = document.getElementById('errorSolutionBox');
const errorSolutionText = document.getElementById('errorSolutionText');
const errorRetryBtn = document.getElementById('errorRetryBtn');
const errorRetryText = document.getElementById('errorRetryText');
const errorAnotherBtn = document.getElementById('errorAnotherBtn');

let activeDownloadController = null;
let currentRetryCount = 0;
let retryCountdownInterval = null;
const MAX_RETRY_ATTEMPTS = 3;

function setModalState(state) {
  if (modalLoading) modalLoading.style.display = state === 'LOADING' ? 'flex' : 'none';
  if (modalReady) modalReady.style.display = state === 'READY' ? 'block' : 'none';
  if (modalProgressState) modalProgressState.style.display = state === 'PROGRESS' ? 'flex' : 'none';
  if (modalErrorState) modalErrorState.style.display = state === 'ERROR' ? 'flex' : 'none';
}

let cachedRedditAuth = null;
async function fetchRedditAuthStatus() {
  try {
    const res = await fetch('/api/reddit-status');
    cachedRedditAuth = await res.json();
    updateRedditAuthIndicator(currentIndex);
  } catch (e) {
    // ignore
  }
}

function updateRedditAuthIndicator(platformIndex) {
  if (!redditAuthBar) return;
  const platform = PLATFORMS[platformIndex];
  const urlVal = (urlInput?.value || '').toLowerCase();
  const isReddit = (platform && platform.id === 'reddit') || urlVal.includes('reddit.com') || urlVal.includes('v.redd.it');

  if (!isReddit) {
    redditAuthBar.style.display = 'none';
    return;
  }

  redditAuthBar.style.display = 'inline-flex';
  if (!cachedRedditAuth || !cachedRedditAuth.configured) {
    redditAuthDot.className = 'auth-dot red';
    redditAuthText.textContent = '🔒 Reddit: No cookies loaded (Guest mode)';
    return;
  }

  if (cachedRedditAuth.hasSessionAuth) {
    redditAuthDot.className = 'auth-dot green';
    redditAuthText.textContent = `🔒 Reddit Cookies: Authenticated Account Session`;
  } else {
    redditAuthDot.className = 'auth-dot amber';
    redditAuthText.textContent = `🔒 Reddit Cookies: Active (${cachedRedditAuth.validCookies || 6} cookies • Guest Session)`;
  }
}

let currentIndex = 0;

function showToast(message) {
  toastNotification.textContent = message;
  toastNotification.classList.add('show');
  setTimeout(() => {
    toastNotification.classList.remove('show');
  }, 3500);
}

// Populate Platforms Dropdown Menu
function buildIndexMenu() {
  indexFilmList.innerHTML = '';
  PLATFORMS.forEach((platform, idx) => {
    const li = document.createElement('li');
    li.className = `index-film-item ${idx === currentIndex ? 'active' : ''}`;
    li.innerHTML = `
      <span class="index-film-item-title">${platform.title}</span>
      <span class="index-film-item-year">${platform.badge}</span>
    `;
    li.addEventListener('click', () => {
      navigateTo(idx);
      toggleIndex(false);
    });
    indexFilmList.appendChild(li);
  });
}

function toggleIndex(forceState) {
  const isOpen = forceState !== undefined ? forceState : !indexDropdown.classList.contains('open');
  indexDropdown.classList.toggle('open', isOpen);
  indexToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

indexToggleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleIndex();
});

document.addEventListener('click', (e) => {
  if (!indexDropdown.contains(e.target) && !indexToggleBtn.contains(e.target)) {
    toggleIndex(false);
  }
});

function updateUI(platformIndex) {
  const platform = PLATFORMS[platformIndex];
  if (!platform) return;

  filmTitleEl.textContent = platform.title;
  platformBadgeEl.textContent = platform.badge;
  specEngineEl.textContent = platform.engine;
  specFormatsEl.textContent = platform.formats;
  specSpeedEl.textContent = platform.speed;
  
  if (Array.isArray(platform.features)) {
    specFeaturesEl.innerHTML = platform.features.map(f => `<span>${f}</span>`).join('<br>');
  } else {
    specFeaturesEl.textContent = platform.features;
  }

  if (platform.reviews && platform.reviews.length >= 2) {
    reviewPub1El.textContent = platform.reviews[0].publication;
    reviewQuote1El.textContent = platform.reviews[0].quote;
    reviewPub2El.textContent = platform.reviews[1].publication;
    reviewQuote2El.textContent = platform.reviews[1].quote;
  }

  urlInput.placeholder = platform.placeholder;

  const items = indexFilmList.querySelectorAll('.index-film-item');
  items.forEach((item, idx) => {
    item.classList.toggle('active', idx === platformIndex);
  });

  updateRedditAuthIndicator(platformIndex);
}

// --------------------------------------------------------------------------
// 4. Three.js 3D WebGL Multi-Disc Conveyor Stage
// --------------------------------------------------------------------------
const container = document.getElementById('webglMount');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(0, 0, 4.4);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

// Lighting Rig
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfffaea, 1.3);
keyLight.position.set(3.5, 4.0, 5.0);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.65);
fillLight.position.set(-4.0, -2.0, 3.5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x499ff5, 0.7);
rimLight.position.set(0, 3.0, -4.0);
scene.add(rimLight);

// Gallery Group: Tilted at -30° X, -30° Y, scale 1.08 as in authentic site
const galleryGroup = new THREE.Group();
galleryGroup.rotation.x = THREE.MathUtils.degToRad(-30);
galleryGroup.rotation.y = THREE.MathUtils.degToRad(-30);
galleryGroup.scale.setScalar(1.08);
scene.add(galleryGroup);

// Center Spindle Hub Ring Textures & Materials (Gleaming Metallic Silver)
function createSilverMatrixTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
  grad.addColorStop(0, '#f8fafc');
  grad.addColorStop(0.35, '#e4e7ec');
  grad.addColorStop(0.65, '#cbd1da');
  grad.addColorStop(0.85, '#eef1f5');
  grad.addColorStop(1, '#bcc3cd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  [0.22, 0.26, 0.31, 0.36, 0.41, 0.46].forEach((r, idx) => {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 - idx * 0.05})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(256, 256, 512 * r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = `rgba(160, 170, 185, ${0.35})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(256, 256, 512 * r + 1.2, 0, Math.PI * 2);
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const silverMatrixTexture = createSilverMatrixTexture();

const matrixMaterial = new THREE.MeshStandardMaterial({
  color: 0xf0f3f8,
  map: silverMatrixTexture,
  roughness: 0.15,
  metalness: 0.9,
  side: THREE.DoubleSide
});

const frostedInnerLipMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide
});

const backDiscMaterial = new THREE.MeshStandardMaterial({
  color: 0x16181f,
  roughness: 0.2,
  metalness: 0.95,
  side: THREE.DoubleSide
});

const edgeBevelMaterial = new THREE.MeshStandardMaterial({
  color: 0xeeeeee,
  roughness: 0.15,
  metalness: 0.85,
  side: THREE.DoubleSide
});

// Disc Mesh Generator
function createDiscMesh(platform) {
  const discGroup = new THREE.Group();

  // 1. Front Artwork Face (Radius 0.24 to 1.0)
  const frontGeo = new THREE.RingGeometry(0.24, 1.0, 96, 1);
  const pos = frontGeo.attributes.position;
  const uvs = frontGeo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uvs.setXY(i, pos.getX(i) * 0.5 + 0.5, pos.getY(i) * 0.5 + 0.5);
  }
  uvs.needsUpdate = true;

  // Generate dynamic canvas texture for this platform
  const discCanvas = generatePlatformDiscCanvas(platform);
  const texture = new THREE.CanvasTexture(discCanvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.encoding = THREE.sRGBEncoding;

  const frontMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.32,
    metalness: 0.22,
    side: THREE.DoubleSide
  });

  const frontMesh = new THREE.Mesh(frontGeo, frontMat);
  frontMesh.position.z = 0.006;
  discGroup.add(frontMesh);

  // 2. Back Face
  const backGeo = frontGeo.clone();
  const backMesh = new THREE.Mesh(backGeo, backDiscMaterial);
  backMesh.position.z = -0.006;
  discGroup.add(backMesh);

  // 3. Central Metal Spindle Matrix Ring (Radius 0.135 to 0.24)
  const matrixGeo = new THREE.RingGeometry(0.135, 0.24, 64, 1);
  const matrixMesh = new THREE.Mesh(matrixGeo, matrixMaterial);
  matrixMesh.position.z = 0.007;
  discGroup.add(matrixMesh);

  const backMatrixMesh = new THREE.Mesh(matrixGeo, matrixMaterial);
  backMatrixMesh.position.z = -0.007;
  discGroup.add(backMatrixMesh);

  // 4. Frosted Inner Lip (Radius 0.115 to 0.135)
  const innerLipGeo = new THREE.RingGeometry(0.115, 0.135, 64, 1);
  const innerLipMesh = new THREE.Mesh(innerLipGeo, frostedInnerLipMaterial);
  innerLipMesh.position.z = 0.0075;
  discGroup.add(innerLipMesh);

  const backInnerLipMesh = new THREE.Mesh(innerLipGeo, frostedInnerLipMaterial);
  backInnerLipMesh.position.z = -0.0075;
  discGroup.add(backInnerLipMesh);

  // 5. Outer Rim Cylinder (Thickness 0.012)
  const edgeGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.012, 64, 1, true);
  const edgeMesh = new THREE.Mesh(edgeGeo, edgeBevelMaterial);
  edgeMesh.rotation.x = Math.PI / 2;
  discGroup.add(edgeMesh);

  // 6. Invisible Hit Target for Raycasting
  const hitGeo = new THREE.CircleGeometry(1.0, 24);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.userData = { platformId: platform.id };
  discGroup.add(hitMesh);

  // Initial tilt
  discGroup.rotation.z = -0.65;
  discGroup.userData = { hitMesh, platformId: platform.id };
  return discGroup;
}

// Instantiate all Discs in Gallery
const discObjects = PLATFORMS.map((platform, index) => {
  const mesh = createDiscMesh(platform);
  mesh.userData.index = index;
  galleryGroup.add(mesh);
  return mesh;
});

// --------------------------------------------------------------------------
// 5. 3D Hand-Drawn Sketchy Rings Halo (Smooth Hermite Ribbon in 3D)
// --------------------------------------------------------------------------
const scribbleGroup = new THREE.Group();
galleryGroup.add(scribbleGroup);

const scribbleLoopsCount = 3;
const scribbleSubdivs = 96;
const scribbleControlPoints = 20;

function createRibbonGeometry(segments) {
  const geo = new THREE.BufferGeometry();
  const vertCount = (segments + 1) * 2;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const t = i * 2;
    indices.push(t, t + 1, t + 2, t + 1, t + 3, t + 2);
  }
  geo.setIndex(indices);
  return geo;
}

const scribbleMaterial = new THREE.MeshBasicMaterial({
  color: 0x0c0c0c,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.92,
  depthWrite: false
});

const scribbleMeshes = [];
for (let l = 0; l < scribbleLoopsCount; l++) {
  const geo = createRibbonGeometry(scribbleSubdivs);
  const mesh = new THREE.Mesh(geo, scribbleMaterial);
  mesh.renderOrder = 900;
  scribbleMeshes.push(mesh);
  scribbleGroup.add(mesh);
}

function updateScribbleRibbons() {
  const baseRadius = 1.04;
  const loopGap = 0.045;
  const strokeHalfWidth = 0.007;
  const jitterAmount = 0.026;

  scribbleMeshes.forEach((mesh, loopIdx) => {
    const pos = mesh.geometry.attributes.position;
    const rBase = baseRadius + loopIdx * loopGap;
    const offsetAngle = (loopIdx * 2.1) + (Math.random() * 0.3);
    const sweep = 0.94;
    const totalAngle = Math.PI * 2 * sweep;

    const ctrl = [];
    for (let c = 0; c < scribbleControlPoints; c++) {
      ctrl.push(1 + (Math.random() - 0.5) * 2 * jitterAmount);
    }
    ctrl.push(ctrl[0]);

    for (let i = 0; i <= scribbleSubdivs; i++) {
      const t = i / scribbleSubdivs;
      const angle = offsetAngle + t * totalAngle;
      const u = t * scribbleControlPoints;
      const idx0 = Math.floor(u);
      const idx1 = Math.min(scribbleControlPoints, idx0 + 1);
      const p = u - idx0;
      const smooth = p * p * (3 - 2 * p);
      const radiusScale = ctrl[idx0] * (1 - smooth) + ctrl[idx1] * smooth;
      
      const taper = Math.min(1, Math.min(t, 1 - t) * 8 + 0.2);
      const halfW = strokeHalfWidth * taper;

      const rCenter = rBase * radiusScale;
      const rInner = rCenter - halfW;
      const rOuter = rCenter + halfW;

      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      pos.setXYZ(i * 2, cosA * rInner, sinA * rInner, 0.01);
      pos.setXYZ(i * 2 + 1, cosA * rOuter, sinA * rOuter, 0.01);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  });
}

let lastScribbleTime = 0;
const scribbleInterval = 1000 / 10;

// --------------------------------------------------------------------------
// 6. Conveyor Curve Math & Animation Loop
// --------------------------------------------------------------------------
let galleryProgress = 0;
let targetProgress = 0;
let isDragging = false;
let startPointerX = 0;
let startProgress = 0;
let dragVelocity = 0;
let lastPointerX = 0;
let lastPointerTime = 0;

function updateDiscTransforms(currentProg) {
  const hGap = 2.4;
  const depthGap = 1.0;

  discObjects.forEach((disc, i) => {
    const m = i - currentProg;
    const absM = Math.abs(m);

    if (absM > 2.5) {
      disc.visible = false;
      return;
    }
    disc.visible = true;

    const isCurrent = absM < 0.05;
    const arc = m * 0.35;

    const x = Math.sin(arc) * hGap * 2.4;
    const y = (isCurrent ? 0.22 : 0.15);
    const z = -Math.cos(arc) * depthGap * 2.4 + depthGap * 2.4;

    disc.position.set(x, y, z);
    disc.rotation.y = -arc;

    if (isCurrent) {
      disc.rotation.z += 0.0015;
    }

    const scale = isCurrent ? 1.0 : Math.max(0.72, 1.0 - absM * 0.2);
    disc.scale.setScalar(scale);
  });

  const activeDisc = discObjects[currentIndex];
  if (activeDisc) {
    scribbleGroup.position.copy(activeDisc.position);
    scribbleGroup.rotation.copy(activeDisc.rotation);
    scribbleGroup.scale.copy(activeDisc.scale);
  }
}

function navigateTo(targetIdx) {
  targetProgress = Math.max(0, Math.min(PLATFORMS.length - 1, targetIdx));
}

function nextPlatform() {
  if (targetProgress < PLATFORMS.length - 1) {
    navigateTo(Math.round(targetProgress) + 1);
  }
}

function prevPlatform() {
  if (targetProgress > 0) {
    navigateTo(Math.round(targetProgress) - 1);
  }
}

// --------------------------------------------------------------------------
// 7. Auto-Detection Engine, Real API Fetching & Download Handlers
// --------------------------------------------------------------------------
const modalThumbImg = document.getElementById('modalThumbImg');

let activeMediaData = null;
let activeTargetUrl = '';

function detectPlatformFromUrl(url) {
  const clean = (url || '').toLowerCase();
  if (clean.includes('youtu.be') || clean.includes('youtube.com')) return 'youtube';
  if (clean.includes('instagram.com') || clean.includes('instagr.am')) return 'instagram';
  if (clean.includes('terabox.com') || clean.includes('1024tera') || clean.includes('teraboxapp')) return 'terabox';
  if (clean.includes('tiktok.com')) return 'tiktok';
  if (clean.includes('facebook.com') || clean.includes('fb.watch')) return 'facebook';
  if (clean.includes('twitter.com') || clean.includes('x.com')) return 'twitter';
  if (clean.includes('spotify.com')) return 'spotify';
  if (clean.includes('soundcloud.com')) return 'soundcloud';
  if (clean.includes('reddit.com') || clean.includes('v.redd.it')) return 'reddit';
  if (clean.includes('pin.it') || clean.includes('pinterest.com')) return 'pinterest';
  if (clean.includes('twitch.tv')) return 'twitch';
  return 'universal';
}

// Live URL auto-detection on input
urlInput.addEventListener('input', () => {
  const val = urlInput.value.trim();
  updateRedditAuthIndicator(currentIndex);
  if (!val) return;
  const detectedId = detectPlatformFromUrl(val);
  const foundIndex = PLATFORMS.findIndex(p => p.id === detectedId);
  if (foundIndex !== -1 && foundIndex !== currentIndex) {
    navigateTo(foundIndex);
  }
});

// Trigger download on Enter key inside input
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const currentPlatform = PLATFORMS[currentIndex];
    triggerMediaAnalysis(urlInput.value, currentPlatform);
  }
});

// Clipboard Paste Button
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text;
      const detectedId = detectPlatformFromUrl(text);
      const foundIndex = PLATFORMS.findIndex(p => p.id === detectedId);
      if (foundIndex !== -1) {
        navigateTo(foundIndex);
      }
      showToast(`📋 Pasted & Detected: ${detectedId.toUpperCase()}`);
    }
  } catch (err) {
    urlInput.focus();
    showToast('Press Ctrl+V to paste URL');
  }
});

// Quick Demo Chips
demoChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const sampleKey = chip.getAttribute('data-sample');
    const pIndex = PLATFORMS.findIndex(p => p.id === sampleKey);
    if (pIndex !== -1) {
      navigateTo(pIndex);
      const p = PLATFORMS[pIndex];
      urlInput.value = p.sampleUrl;
      triggerMediaAnalysis(p.sampleUrl, p);
    }
  });
});

// Download Button Click
downloadBtn.addEventListener('click', () => {
  const currentPlatform = PLATFORMS[currentIndex];
  const inputVal = (urlInput.value || '').trim();
  if (!inputVal) {
    showToast('⚠️ Please paste a video or audio link to download');
    urlInput.focus();
    return;
  }
  triggerMediaAnalysis(inputVal, currentPlatform);
});

// Real Extraction Analysis via Server API with Full Classification & Recovery
async function triggerMediaAnalysis(targetUrl, fallbackPlatform) {
  const urlToFetch = (targetUrl || urlInput.value || '').trim();
  if (!urlToFetch) {
    showToast('⚠️ Please paste a valid video or audio URL');
    urlInput.focus();
    return;
  }

  activeTargetUrl = urlToFetch;
  downloadModal.classList.add('open');
  setModalState('LOADING');

  loadingStatusText.textContent = `Analyzing stream metadata for ${urlToFetch.slice(0, 45)}...`;

  // Draw initial fallback thumbnail canvas
  const thumbCtx = modalThumbCanvas.getContext('2d');
  thumbCtx.fillStyle = '#181b22';
  thumbCtx.fillRect(0, 0, 220, 130);
  const grad = thumbCtx.createLinearGradient(0, 0, 220, 130);
  grad.addColorStop(0, fallbackPlatform ? fallbackPlatform.color : '#8a2be2');
  grad.addColorStop(1, '#0c0c0c');
  thumbCtx.fillStyle = grad;
  thumbCtx.fillRect(0, 0, 220, 130);

  modalThumbImg.style.display = 'none';
  modalThumbCanvas.style.display = 'block';

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlToFetch })
    });

    const data = await res.json();

    if (data && data.success) {
      currentRetryCount = 0;
      activeMediaData = data;
      setModalState('READY');
      renderRealMediaInfo(data);
    } else {
      renderClassifiedError(data?.classification || data?.error, data, urlToFetch, () => {
        triggerMediaAnalysis(urlToFetch, fallbackPlatform);
      });
    }
  } catch (err) {
    console.warn('Stream server error:', err);
    renderClassifiedError(err.message, { error: err.message }, urlToFetch, () => {
      triggerMediaAnalysis(urlToFetch, fallbackPlatform);
    });
  }
}

/**
 * Premium Classified Error Renderer
 * Displays accurate category badge, clear icons, friendly plain-language titles,
 * helpful descriptions, actionable suggestions, and a timed Retry button.
 */
function renderClassifiedError(classification, rawData, currentUrl, retryCallback) {
  // Clear any existing countdown interval
  if (retryCountdownInterval) {
    clearInterval(retryCountdownInterval);
    retryCountdownInterval = null;
  }

  setModalState('ERROR');

  const c = (typeof classification === 'object' && classification !== null)
    ? classification
    : {
        category: 'UNKNOWN_ERROR',
        badge: 'EXTRACTION NOTICE',
        icon: '⚠️',
        title: 'Extraction Could Not Complete',
        message: String(classification || 'Unable to parse media stream from this link.'),
        solution: 'Please check that the link is public, accessible, and contains media.',
        canRetry: true,
        retryDelayMs: 3000
      };

  errorBadge.textContent = c.badge || 'ERROR';
  errorIcon.textContent = c.icon || '⚠️';
  errorTitle.textContent = c.title || 'Unable to Extract Media';
  errorDescription.textContent = c.message || 'Please check that the link is public and contains media.';

  // Build solution text with optional official guide link
  let solHtml = c.solution || 'Verify the link in your browser or try another link.';
  if (c.officialGuide) {
    solHtml += ` <br><a href="${c.officialGuide}" target="_blank" rel="noopener" style="color: #0070f3; text-decoration: underline; margin-top: 0.35rem; display: inline-block;">Official Cookies & Access Guide ↗</a>`;
  }
  errorSolutionText.innerHTML = solHtml;

  // Retry handling with exponential backoff & countdown
  const canRetry = Boolean(c.canRetry) && currentRetryCount < MAX_RETRY_ATTEMPTS;
  if (canRetry) {
    errorRetryBtn.style.display = 'inline-flex';
    errorRetryBtn.disabled = false;

    // Exponential backoff: 3s, 4.5s, 6.7s etc.
    let remainingSec = Math.max(1, Math.round(((c.retryDelayMs || 3000) * Math.pow(1.5, currentRetryCount)) / 1000));
    errorRetryText.textContent = `Retry (${remainingSec}s)`;

    retryCountdownInterval = setInterval(() => {
      remainingSec--;
      if (remainingSec > 0) {
        errorRetryText.textContent = `Retry (${remainingSec}s)`;
      } else {
        clearInterval(retryCountdownInterval);
        retryCountdownInterval = null;
        errorRetryText.textContent = 'Retry Now';
      }
    }, 1000);

    errorRetryBtn.onclick = () => {
      if (retryCountdownInterval) {
        clearInterval(retryCountdownInterval);
        retryCountdownInterval = null;
      }
      currentRetryCount++;
      errorRetryBtn.disabled = true;
      errorRetryText.textContent = 'Retrying...';
      if (typeof retryCallback === 'function') {
        retryCallback();
      } else {
        triggerMediaAnalysis(currentUrl || activeTargetUrl);
      }
    };
  } else {
    errorRetryBtn.style.display = 'none';
  }

  // Graceful Recovery: "Try Another Link" preserves URL, selects it, and closes modal
  errorAnotherBtn.onclick = () => {
    if (retryCountdownInterval) {
      clearInterval(retryCountdownInterval);
      retryCountdownInterval = null;
    }
    currentRetryCount = 0;
    downloadModal.classList.remove('open');
    setModalState('READY');
    urlInput.focus();
    urlInput.select();
  };
}

function renderRealMediaInfo(data) {
  modalLoading.style.display = 'none';
  modalReady.style.display = 'block';

  detectedPlatformBadge.textContent = `${(data.platform || 'STREAM').toUpperCase()} • READY TO DOWNLOAD`;
  mediaTitle.textContent = data.title;
  mediaUploader.textContent = `${data.uploader || 'Creator'} • Duration: ${data.durationFormatted || 'HD Stream'}`;
  mediaDurationTag.textContent = data.durationFormatted || 'HD';

  if (data.thumbnail) {
    modalThumbImg.src = data.thumbnail;
    modalThumbImg.style.display = 'block';
    modalThumbCanvas.style.display = 'none';
  }

  // Tab label handling (e.g. Photo vs Video)
  const vTab = document.querySelector('[data-tab="video"]');
  const aTab = document.querySelector('[data-tab="audio"]');
  const isPhotoOnly = data.videoFormats && data.videoFormats.every(f => f.ext === 'jpg' || f.ext === 'png' || f.ext === 'jpeg' || f.fps === 0);

  if (vTab) {
    vTab.textContent = isPhotoOnly ? '🖼️ Photo / Image (HQ)' : '🎬 Video (MP4)';
    vTab.classList.add('active');
  }

  if (aTab) {
    if (!data.audioFormats || data.audioFormats.length === 0) {
      aTab.style.display = 'none';
    } else {
      aTab.style.display = 'inline-flex';
      aTab.textContent = '🎵 Audio (MP3 / FLAC)';
      aTab.classList.remove('active');
    }
  }

  videoTabContent.style.display = 'block';
  audioTabContent.style.display = 'none';

  // Populate Real Video Formats
  videoTabContent.innerHTML = '';
  if (data.videoFormats && data.videoFormats.length > 0) {
    data.videoFormats.forEach(f => {
      const row = document.createElement('div');
      row.className = 'quality-item';
      const isImg = f.ext === 'jpg' || f.ext === 'png' || f.ext === 'jpeg' || f.fps === 0;
      const subLabel = isImg 
        ? `${(f.ext || 'JPG').toUpperCase()} • Original Master Quality`
        : `${f.resolution} • ${f.fps || 30}fps • ${(f.ext || 'MP4').toUpperCase()}`;

      row.innerHTML = `
        <div class="q-left">
          <span class="q-res">${f.label || f.resolution}</span>
          <span class="q-codec">${subLabel}</span>
        </div>
        <div class="q-right">
          <span class="q-size">${f.filesizeFormatted || 'Direct Stream'}</span>
          <button class="action-dl-btn" data-type="video" data-selector="${f.selector}">Download</button>
        </div>
      `;
      row.querySelector('.action-dl-btn').addEventListener('click', () => {
        executeDirectDownload(activeTargetUrl, f.selector, 'video', data.title, f.ext || (isImg ? 'jpg' : 'mp4'));
      });
      videoTabContent.appendChild(row);
    });
  }

  // Populate Real Audio Formats
  audioTabContent.innerHTML = '';
  if (data.audioFormats && data.audioFormats.length > 0) {
    data.audioFormats.forEach(a => {
      const row = document.createElement('div');
      row.className = 'quality-item';
      row.innerHTML = `
        <div class="q-left">
          <span class="q-res">${a.quality}</span>
          <span class="q-codec">${a.bitrate} • Stereo</span>
        </div>
        <div class="q-right">
          <span class="q-size">${a.filesizeFormatted || 'High Bitrate'}</span>
          <button class="action-dl-btn" data-type="audio" data-selector="${a.selector}">Download</button>
        </div>
      `;
      row.querySelector('.action-dl-btn').addEventListener('click', () => {
        executeDirectDownload(activeTargetUrl, a.selector, 'audio', data.title, a.ext || 'mp3');
      });
      audioTabContent.appendChild(row);
    });
  }
}

function renderFallbackMediaInfo(platform) {
  renderClassifiedError({
    category: 'EXTRACTION_NOTICE',
    badge: 'MEDIA NOTICE',
    icon: 'ℹ️',
    title: 'No Media Stream Available',
    message: 'Could not extract valid media streams for this link. Please check that the URL is public and valid.',
    solution: 'Verify the link in your browser or paste a direct media URL.',
    canRetry: false
  }, {}, activeTargetUrl);
}

async function executeDirectDownload(url, selector, type, title, ext) {
  const finalExt = ext || (type === 'audio' ? 'mp3' : (type === 'image' ? 'png' : 'mp4'));
  const cleanTitle = (title || 'download').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'media';
  const dlUrl = `/api/download?url=${encodeURIComponent(url)}&format=${encodeURIComponent(selector)}&type=${type}&ext=${finalExt}&title=${encodeURIComponent(cleanTitle)}`;

  // Abort any ongoing download stream
  if (activeDownloadController) {
    try { activeDownloadController.abort(); } catch (e) {}
  }
  activeDownloadController = new AbortController();

  // Switch modal state to PROGRESS
  setModalState('PROGRESS');
  progressBadge.textContent = `${type.toUpperCase()} • ${finalExt.toUpperCase()}`;
  progressTitle.textContent = 'Processing & Preparing Stream...';
  progressDesc.textContent = 'Muxing media formats and initializing download pipeline...';
  progressBarFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressSize.textContent = 'Connecting...';

  // Wire Cancel Transfer button
  progressCancelBtn.onclick = () => {
    if (activeDownloadController) {
      activeDownloadController.abort();
      activeDownloadController = null;
    }
    showToast('Download transfer cancelled.');
    setModalState('READY');
  };

  try {
    const res = await fetch(dlUrl, {
      signal: activeDownloadController.signal
    });

    // Check if server returned a structured error response
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || contentType.includes('application/json')) {
      let errData = null;
      try {
        errData = await res.json();
      } catch (parseErr) {
        errData = { error: `Server returned HTTP ${res.status}: ${res.statusText}` };
      }
      renderClassifiedError(errData?.classification || errData?.error, errData, url, () => {
        executeDirectDownload(url, selector, type, title, ext);
      });
      return;
    }

    // Stream chunks with real-time percentage and byte counters
    const contentLengthHeader = res.headers.get('content-length');
    const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
    let receivedBytes = 0;

    progressTitle.textContent = `Downloading ${cleanTitle.slice(0, 32)}...`;
    progressDesc.textContent = totalBytes > 0
      ? `Transferring ${formatBytes(totalBytes)} ${finalExt.toUpperCase()} file to browser...`
      : 'Receiving media stream chunks from server...';

    const reader = res.body ? res.body.getReader() : null;
    const chunks = [];

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;

        if (totalBytes > 0) {
          const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
          progressBarFill.style.width = `${percent}%`;
          progressPercent.textContent = `${percent}%`;
          progressSize.textContent = `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)}`;
        } else {
          progressSize.textContent = `${formatBytes(receivedBytes)} transferred`;
          progressBarFill.style.width = '75%';
        }
      }
    } else {
      const blob = await res.blob();
      chunks.push(new Uint8Array(await blob.arrayBuffer()));
      receivedBytes = blob.size;
    }

    // Assemble completed file and trigger browser save
    progressBarFill.style.width = '100%';
    progressPercent.textContent = '100%';
    progressTitle.textContent = 'Download Complete!';
    progressDesc.textContent = 'Saving file to your downloads...';

    const finalBlob = new Blob(chunks, { type: contentType || 'application/octet-stream' });
    const blobUrl = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.setAttribute('download', `${cleanTitle}.${finalExt}`);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(blobUrl);
    }, 2000);

    showToast(`✅ Successfully downloaded ${cleanTitle}.${finalExt}`);
    setTimeout(() => {
      downloadModal.classList.remove('open');
      setModalState('READY');
    }, 1200);

  } catch (streamErr) {
    if (streamErr.name === 'AbortError') {
      return; // Handled cancel
    }
    console.error('Download stream error:', streamErr);
    renderClassifiedError(streamErr.message, { error: streamErr.message }, url, () => {
      executeDirectDownload(url, selector, type, title, ext);
    });
  } finally {
    activeDownloadController = null;
  }
}

// Modal Close Handlers
closeModalBtn.addEventListener('click', () => {
  downloadModal.classList.remove('open');
});

downloadModal.addEventListener('click', (e) => {
  if (e.target === downloadModal) {
    downloadModal.classList.remove('open');
  }
});

// Format Tabs Switching (Video vs Audio)
const formatTabs = document.querySelectorAll('.format-tab');
const videoTabContent = document.getElementById('videoTabContent');
const audioTabContent = document.getElementById('audioTabContent');

formatTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    formatTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const tabType = tab.getAttribute('data-tab');
    if (tabType === 'video') {
      videoTabContent.style.display = 'block';
      audioTabContent.style.display = 'none';
    } else {
      videoTabContent.style.display = 'none';
      audioTabContent.style.display = 'block';
    }
  });
});

// --------------------------------------------------------------------------
// 8. 3D WebGL Drag, Wheel, Key, and Raycast Click Handlers
// --------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();

container.addEventListener('pointerdown', (e) => {
  isDragging = true;
  startPointerX = e.clientX;
  lastPointerX = e.clientX;
  lastPointerTime = performance.now();
  startProgress = galleryProgress;
  dragVelocity = 0;
  container.setPointerCapture(e.pointerId);
});

window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;

  const now = performance.now();
  const dt = Math.max(1, now - lastPointerTime);
  const deltaX = e.clientX - lastPointerX;

  dragVelocity = deltaX / dt;
  lastPointerX = e.clientX;
  lastPointerTime = now;

  const totalDelta = (e.clientX - startPointerX) / (window.innerWidth * 0.45);
  galleryProgress = startProgress - totalDelta;
  targetProgress = galleryProgress;
});

window.addEventListener('pointerup', (e) => {
  if (!isDragging) return;
  isDragging = false;
  try { container.releasePointerCapture(e.pointerId); } catch (_) {}

  const moved = Math.abs(e.clientX - startPointerX);
  if (moved < 6) {
    const rect = container.getBoundingClientRect();
    mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera);
    const hitMeshes = discObjects.map(d => d.userData.hitMesh);
    const intersects = raycaster.intersectObjects(hitMeshes);

    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      const clickedParent = clickedMesh.parent;
      if (clickedParent && typeof clickedParent.userData.index === 'number') {
        navigateTo(clickedParent.userData.index);
        return;
      }
    }
  }

  const momentum = -dragVelocity * 140;
  let snapped = Math.round(galleryProgress + momentum);
  snapped = Math.max(0, Math.min(PLATFORMS.length - 1, snapped));
  targetProgress = snapped;
});

window.addEventListener('pointercancel', (e) => {
  if (!isDragging) return;
  isDragging = false;
  try { container.releasePointerCapture(e.pointerId); } catch (_) {}
  targetProgress = Math.max(0, Math.min(PLATFORMS.length - 1, Math.round(galleryProgress)));
});

container.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = Math.sign(e.deltaY || e.deltaX);
  if (delta > 0) {
    nextPlatform();
  } else if (delta < 0) {
    prevPlatform();
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    nextPlatform();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    prevPlatform();
  }
});

// Dynamic Camera Framing & Resize for Mobile Portrait, Tablets & Desktop
function updateCameraFraming() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  const aspect = w / h;
  camera.aspect = aspect;

  if (w <= 360) {
    // Ultra-narrow Android compact / Fold outer display
    camera.position.z = 6.4;
    galleryGroup.scale.setScalar(0.82);
  } else if (h <= 520 && aspect > 1.2) {
    // Mobile Landscape orientation (Wide & Short)
    camera.position.z = 4.3;
    galleryGroup.scale.setScalar(0.92);
  } else if (aspect < 0.85) {
    // Standard Mobile Portrait (360px - 430px)
    camera.position.z = 5.7;
    galleryGroup.scale.setScalar(0.90);
  } else if (aspect < 1.2) {
    // Tablets & Foldables unfolded (600px - 850px)
    camera.position.z = 4.8;
    galleryGroup.scale.setScalar(1.0);
  } else {
    // Desktop Landscape
    camera.position.z = 4.4;
    galleryGroup.scale.setScalar(1.08);
  }
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener('resize', updateCameraFraming);

// --------------------------------------------------------------------------
// 9. Render Loop
// --------------------------------------------------------------------------
function animate(time) {
  requestAnimationFrame(animate);

  if (!isDragging) {
    const diff = targetProgress - galleryProgress;
    galleryProgress += diff * 0.085;
  }

  const rounded = Math.round(galleryProgress);
  const clamped = Math.max(0, Math.min(PLATFORMS.length - 1, rounded));
  if (clamped !== currentIndex && Math.abs(galleryProgress - clamped) < 0.3) {
    currentIndex = clamped;
    updateUI(currentIndex);
  }

  updateDiscTransforms(galleryProgress);

  if (time - lastScribbleTime > scribbleInterval) {
    updateScribbleRibbons();
    lastScribbleTime = time;
  }

  renderer.render(scene, camera);
}

// --------------------------------------------------------------------------
// 10. Initialization
// --------------------------------------------------------------------------
buildIndexMenu();
updateUI(0);
fetchRedditAuthStatus();
updateScribbleRibbons();
updateCameraFraming();
requestAnimationFrame(animate);
