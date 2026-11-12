import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

let WebSocketServer = null;
try {
  const wsMod = await import('ws');
  WebSocketServer = wsMod.WebSocketServer || wsMod.default?.WebSocketServer;
} catch (e) {
  console.warn('[Server] Optional "ws" module not available; real-time presence running in HTTP polling mode.');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Helper: Check if yt-dlp is available in PATH
function checkYtdlp() {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', ['--version']);
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

// Helper: Format bytes to human-readable size
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return null;
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Helper: Format seconds to MM:SS or HH:MM:SS
function formatDuration(sec) {
  if (!sec || isNaN(sec)) return '00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Helper: Sanitize filename for Content-Disposition
function sanitizeFilename(name, ext = 'mp4') {
  const clean = (name || 'media').replace(/[^a-zA-Z0-9_\-\.\s]/g, '').trim().replace(/\s+/g, '_');
  return `${clean.slice(0, 80)}.${ext}`;
}

// --------------------------------------------------------------------------
// Universal Music Discovery & YouTube Dynamic Search Subsystem
// --------------------------------------------------------------------------
const musicSearchCache = new Map(); // key -> { tracks, timestamp }

async function queryDynamicYouTubeTracks(query, maxResults = 25) {
  if (!query || !query.trim()) return [];
  const cleanQuery = query.trim();

  // 1. YouTube Data API v3 if API key is present
  if (process.env.YOUTUBE_API_KEY) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=${maxResults}&q=${encodeURIComponent(cleanQuery)}&key=${process.env.YOUTUBE_API_KEY}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          return data.items.map(item => {
            const vId = item.id?.videoId || item.id;
            const thumb = (item.snippet.thumbnails?.high || item.snippet.thumbnails?.medium || item.snippet.thumbnails?.default)?.url || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
            return {
              id: `yt-${vId}`,
              youtubeId: vId,
              title: item.snippet.title,
              artist: item.snippet.channelTitle || 'YouTube Music',
              album: item.snippet.channelTitle || 'YouTube Music',
              duration: '03:45',
              durationSeconds: 225,
              artwork: thumb,
              provider: 'youtube',
              isPlayable: true,
              categories: ['universal', 'youtube']
            };
          });
        }
      }
    } catch (e) {
      console.warn('[YOUTUBE API] Request error, falling back to yt-dlp:', e.message);
    }
  }

  // 2. Local yt-dlp dynamic search fallback (Zero API key required!)
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', [
      `ytsearch${maxResults}:${cleanQuery}`,
      '--dump-json',
      '--flat-playlist',
      '--skip-download',
      '--no-warnings'
    ]);

    let output = '';
    proc.stdout.on('data', (d) => { output += d.toString('utf8'); });
    proc.stderr.on('data', () => {}); // swallow warnings

    proc.on('close', () => {
      const tracks = [];
      const lines = output.trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line.trim());
          if (item && item.id) {
            let thumb = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
            if (Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
              thumb = item.thumbnails[item.thumbnails.length - 1].url || thumb;
            }
            tracks.push({
              id: `yt-${item.id}`,
              youtubeId: item.id,
              title: item.title || 'Untitled Track',
              artist: item.uploader || item.channel || 'YouTube Music',
              album: item.channel || 'YouTube Music',
              duration: item.duration_string || formatDuration(item.duration),
              durationSeconds: item.duration || 0,
              artwork: thumb,
              provider: 'youtube',
              isPlayable: true,
              categories: ['universal', 'youtube']
            });
          }
        } catch (e) {}
      }
      resolve(tracks);
    });

    proc.on('error', (err) => {
      console.warn('[YT-DLP SEARCH] Process spawn error:', err.message);
      resolve([]);
    });
  });
}

// --------------------------------------------------------------------------
// Secure Cookie & Authentication Subsystem (Per Official yt-dlp Cookies Guide)
// https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp
// --------------------------------------------------------------------------

// Whitelist of valid browsers supported by yt-dlp to prevent argument or command injection
const ALLOWED_BROWSERS = new Set([
  'brave', 'chrome', 'chromium', 'edge', 'firefox', 'opera', 'safari', 'vivaldi', 'whale'
]);

// --------------------------------------------------------------------------
// Real-Time Active Listeners & Activity Subsystem (Rewind Radio WebSocket)
// --------------------------------------------------------------------------
// Deduplication: Map<sessionId, { sockets: Set<WebSocket>, lastSeen: number, ip: string }>
const activeSessions = new Map();

function getActiveListenersCount() {
  return activeSessions.size;
}

function broadcastPresence() {
  const count = getActiveListenersCount();
  const payload = JSON.stringify({
    type: 'presence',
    activeListeners: count,
    timestamp: Date.now()
  });

  for (const session of activeSessions.values()) {
    for (const ws of session.sockets) {
      if (ws.readyState === 1) { // 1 = OPEN
        try {
          ws.send(payload);
        } catch (e) {
          // ignore dead socket
        }
      }
    }
  }
}

function broadcastActivity(activityMsg, originSessionId) {
  const payload = JSON.stringify({
    type: 'activity',
    message: activityMsg,
    timestamp: Date.now()
  });

  for (const [sessId, session] of activeSessions.entries()) {
    for (const ws of session.sockets) {
      if (ws.readyState === 1) {
        try {
          ws.send(payload);
        } catch (e) {}
      }
    }
  }
}

// Periodic cleanup of dead sessions every 25s
setInterval(() => {
  const now = Date.now();
  let changed = false;

  for (const [sessId, session] of activeSessions.entries()) {
    for (const ws of session.sockets) {
      if (ws.readyState !== 1 && ws.readyState !== 0) {
        session.sockets.delete(ws);
      }
    }
    if (session.sockets.size === 0 || (now - session.lastSeen > 60000)) {
      activeSessions.delete(sessId);
      changed = true;
    }
  }

  if (changed) {
    broadcastPresence();
  }
}, 25000);

/**
 * Sanitizes any output to ensure cookies, session tokens, and filesystem paths are never leaked.
 */
function sanitizeCookieOutput(str) {
  if (!str) return '';
  return String(str)
    // Redact cookie file paths
    .replace(/[A-Za-z]:\\[^"'\n\r<>|:]+\b(?:cookies|reddit_cookies)[^"'\n\r<>|:]*\.txt/gi, '[PROTECTED_COOKIE_FILE]')
    .replace(/(?:\/[^\/]+)+\/(?:cookies|reddit_cookies)[^\/]*\.txt/gi, '[PROTECTED_COOKIE_FILE]')
    // Redact sensitive cookie tokens / session keys
    .replace(/(?:token_v2|reddit_session|session_tracker|edgebucket)=[^;\s"']+/gi, '$1=[REDACTED]')
    .replace(/(?:Cookie|set-cookie):\s*[^\r\n]+/gi, 'Cookie: [REDACTED]')
    // Redact browser profile paths
    .replace(/(?:--cookies-from-browser\s+)[^\s]+/gi, '--cookies-from-browser [PROTECTED_BROWSER]');
}

/**
 * Synchronizes and converts Reddit cookies from user exports (JSON or Netscape TXT)
 * into a safe, active Netscape cookies file in cookies/reddit_cookies.txt.
 * NEVER modifies, overwrites, or deletes original user cookie files.
 */
function syncRedditCookies() {
  const cookiesDir = path.join(__dirname, 'cookies');
  const activeNetscapePath = path.join(cookiesDir, 'reddit_cookies.txt');

  // Candidate source locations in priority order
  const explicit = process.env.REDDIT_COOKIES_FILE || process.env.COOKIES_FILE;
  const candidates = [
    explicit,
    'C:\\Users\\L i q u i d\\Downloads\\kukiji-cookies-www.reddit.com-20261109-225556.json',
    path.join(cookiesDir, 'reddit_cookies.json'),
    path.join(cookiesDir, 'cookies.json'),
    path.join(cookiesDir, 'reddit_cookies.txt'),
    path.join(cookiesDir, 'cookies.txt')
  ];

  // Scan user Downloads directory for any Reddit cookie export
  try {
    const dlDir = path.join(os.homedir(), 'Downloads');
    if (fs.existsSync(dlDir)) {
      const files = fs.readdirSync(dlDir);
      for (const f of files) {
        if (f.toLowerCase().includes('reddit') && (f.endsWith('.json') || f.endsWith('.txt'))) {
          candidates.push(path.join(dlDir, f));
        }
      }
    }
  } catch (e) {
    // ignore filesystem access errors
  }

  let foundSource = null;
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      try {
        const stat = fs.statSync(c);
        if (stat.isFile() && stat.size > 0) {
          foundSource = c;
          break;
        }
      } catch (e) {}
    }
  }

  if (!foundSource) {
    return { configured: false, status: 'No Reddit cookies found' };
  }

  // Case A: Source is already a Netscape formatted text file
  if (foundSource.endsWith('.txt')) {
    try {
      const stat = fs.statSync(foundSource);
      return {
        configured: true,
        type: 'netscape_txt',
        source: path.basename(foundSource),
        path: foundSource,
        totalCookies: 1,
        validCookies: 1,
        expiredCookies: 0,
        hasSessionAuth: true,
        isGuestSession: false,
        status: 'Active (Netscape format)'
      };
    } catch (e) {
      return { configured: false, status: 'Unreadable cookie file' };
    }
  }

  // Case B: Source is a WebExtension JSON cookie export (e.g. Kukiji)
  try {
    const raw = JSON.parse(fs.readFileSync(foundSource, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) {
      return { configured: false, status: 'Empty or invalid cookie JSON' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    let validCount = 0;
    let expiredCount = 0;
    let hasSessionAuth = false;

    const lines = [
      '# Netscape HTTP Cookie File',
      '# http://curl.haxx.se/rfc/cookie_spec.html',
      '# This is a generated file by OMNI! Do not edit.'
    ];

    for (const c of raw) {
      if (!c.name || !c.domain) continue;

      // Check for authenticated session indicators
      if (c.name === 'reddit_session' || c.name === 'token_v2' || c.name === 'session_tracker') {
        hasSessionAuth = true;
      }

      const exp = c.expirationDate ? Math.round(c.expirationDate) : (c.session ? 0 : 2147483647);
      if (exp > 0 && exp < nowSec) {
        expiredCount++;
      } else {
        validCount++;
      }

      // Map domains: ensure subdomains and apex .reddit.com are included
      const domains = [c.domain];
      if (c.domain === 'www.reddit.com' || c.domain === '.www.reddit.com') {
        domains.push('.reddit.com');
      }
      for (let dom of domains) {
        if (!dom.startsWith('.')) dom = '.' + dom;
        const cookiePath = c.path || '/';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        lines.push([dom, 'TRUE', cookiePath, secure, exp, c.name, c.value].join('\t'));
      }
    }

    if (validCount === 0 && expiredCount > 0) {
      return {
        configured: false,
        expired: true,
        status: 'Expired Reddit cookies (Please re-export)'
      };
    }

    fs.mkdirSync(cookiesDir, { recursive: true });
    // Write converted Netscape format into isolated cookies directory
    fs.writeFileSync(activeNetscapePath, lines.join('\n') + '\n', 'utf8');

    return {
      configured: true,
      type: 'converted_json',
      source: path.basename(foundSource),
      path: activeNetscapePath,
      totalCookies: raw.length,
      validCookies: validCount,
      expiredCookies: expiredCount,
      hasSessionAuth,
      isGuestSession: !hasSessionAuth,
      status: hasSessionAuth
        ? 'Active (Authenticated Session)'
        : `Active (Guest Session • ${validCount} cookies)`
    };
  } catch (err) {
    return { configured: false, status: 'Invalid cookie JSON format' };
  }
}

/**
 * Validates and safely resolves a browser cookie specification for --cookies-from-browser.
 * Follows yt-dlp syntax: BROWSER[+KEYRING][:PROFILE][::CONTAINER]
 * Strictly validated against whitelist to prevent command or argument injection.
 */
function resolveBrowserCookieSpec() {
  const envBrowser = process.env.REDDIT_COOKIES_BROWSER || process.env.YTDLP_COOKIES_BROWSER || process.env.COOKIES_BROWSER;
  if (!envBrowser) return null;

  const trimmed = envBrowser.trim();
  // Ensure input contains strictly safe identifier characters
  if (!/^[a-zA-Z0-9_\-\+:\.]+$/.test(trimmed)) {
    return null;
  }

  const baseBrowser = trimmed.split(/[:+]/)[0].toLowerCase();
  if (!ALLOWED_BROWSERS.has(baseBrowser)) {
    return null;
  }

  return trimmed;
}

/**
 * Generates authentication arguments for yt-dlp.
 * Requirement 2: AUTOMATICALLY APPLIED ONLY TO REDDIT URLS.
 */
function getAuthArgs(targetUrl) {
  const isReddit = /reddit\.com|redd\.it/i.test(targetUrl || '');
  if (!isReddit) {
    return []; // Never apply Reddit cookies to YouTube, Pinterest, or other platforms!
  }

  const syncResult = syncRedditCookies();
  if (syncResult && syncResult.configured && syncResult.path) {
    return ['--cookies', syncResult.path];
  }

  const browserSpec = resolveBrowserCookieSpec();
  if (browserSpec) {
    return ['--cookies-from-browser', browserSpec];
  }

  return [];
}

/**
 * Returns safe cookie configuration status (never reveals tokens or absolute paths).
 */
function getCookieStatus() {
  const syncResult = syncRedditCookies();
  if (syncResult && syncResult.configured) {
    return {
      configured: true,
      type: syncResult.type || 'file',
      source: syncResult.source,
      totalCookies: syncResult.totalCookies || 0,
      validCookies: syncResult.validCookies || 0,
      expiredCookies: syncResult.expiredCookies || 0,
      hasSessionAuth: Boolean(syncResult.hasSessionAuth),
      isGuestSession: Boolean(syncResult.isGuestSession),
      status: syncResult.status
    };
  }

  const browserSpec = resolveBrowserCookieSpec();
  if (browserSpec) {
    const baseBrowser = browserSpec.split(/[:+]/)[0].toLowerCase();
    return {
      configured: true,
      type: 'browser',
      browser: baseBrowser,
      status: `Active (Browser: ${baseBrowser})`
    };
  }

  return {
    configured: false,
    type: 'none',
    status: syncResult.status || 'Not Configured'
  };
}

// --------------------------------------------------------------------------
// Centralized Error Classification & Structured Logging Subsystem
// --------------------------------------------------------------------------
let activeDownloads = 0;
const MAX_CONCURRENT_DOWNLOADS = 15;

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function detectPlatformFromUrl(url = '') {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('reddit.com') || lower.includes('redd.it')) return 'reddit';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('pinterest.com') || lower.includes('pin.it')) return 'pinterest';
  if (lower.includes('spotify.com') || lower.includes('spotify.link')) return 'spotify';
  if (lower.includes('terabox.com') || lower.includes('1024tera.com')) return 'terabox';
  if (lower.includes('twitch.tv')) return 'twitch';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'x';
  if (lower.includes('soundcloud.com')) return 'soundcloud';
  return 'media';
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parses and maps Reddit errors (authentication, 403 blocks, age-restriction, DPAPI lock)
 * into actionable, user-friendly guidance following the official yt-dlp cookies guide.
 */
function parseRedditError(stderr, targetUrl) {
  const sanitized = sanitizeCookieOutput(stderr || '');
  const lower = sanitized.toLowerCase();
  const cookieStatus = getCookieStatus();

  const isDpapiOrLock = lower.includes('failed to decrypt with dpapi') ||
                        lower.includes('could not copy chrome cookie database');

  if (isDpapiOrLock) {
    return {
      isAuthError: true,
      platform: 'reddit',
      title: 'Browser Cookie Database Locked / Encrypted',
      message: 'Chromium App-Bound encryption or an open browser prevented reading cookies directly on Windows.',
      guidance: 'Export your Reddit cookies to a JSON or "cookies.txt" file and place in Downloads or the OMNI cookies/ folder, or set REDDIT_COOKIES_BROWSER=firefox. See: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp',
      officialGuide: 'https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp'
    };
  }

  const isAuthRequired = lower.includes('account authentication is required') ||
                         lower.includes('session request failed: http error 403') ||
                         lower.includes('http error 403: blocked') ||
                         lower.includes('age-restricted') ||
                         lower.includes('nsfw') ||
                         lower.includes('login required');

  if (isAuthRequired) {
    if (cookieStatus.configured && cookieStatus.isGuestSession) {
      return {
        isAuthError: true,
        platform: 'reddit',
        title: 'Logged-In Reddit Account Required',
        message: 'Your exported Reddit cookies are active (Guest Session), but this specific post is age-restricted, NSFW, or requires a logged-in Reddit account session.',
        guidance: 'Log into Reddit in your browser, re-export cookies using Kukiji or "Get cookies.txt LOCALLY" (ensuring reddit_session is included), and save to your Downloads or cookies/ folder.',
        officialGuide: 'https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp'
      };
    }

    return {
      isAuthError: true,
      platform: 'reddit',
      title: 'Reddit Authentication Required',
      message: 'This Reddit post is age-restricted, NSFW, or gated by Reddit anti-bot protection.',
      guidance: 'To download authenticated or age-restricted Reddit posts, export your Reddit cookies to a JSON or "cookies.txt" file in the OMNI directory or set REDDIT_COOKIES_BROWSER=firefox per the official yt-dlp cookies guide.',
      officialGuide: 'https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp'
    };
  }

  return null;
}

/**
 * Universal Error Classification Engine for all OMNI download platforms.
 * Categorizes errors with accurate status codes, clear titles, simple descriptions,
 * actionable solutions, and retry eligibility.
 */
function classifyError(err, targetUrl = '', platformHint = '') {
  const rawMsg = err?.message || String(err || '');
  const sanitized = sanitizeCookieOutput(rawMsg);
  const lower = sanitized.toLowerCase();
  const domain = extractDomain(targetUrl);
  const platform = platformHint || detectPlatformFromUrl(targetUrl);

  // 1. Invalid or Missing URL
  if (!targetUrl || targetUrl.trim() === '' || lower.includes('missing "url"') || lower.includes('is not a valid url')) {
    return {
      category: 'INVALID_URL',
      statusCode: 400,
      badge: 'INVALID URL',
      icon: '🔗',
      title: 'Invalid Media Link',
      message: 'The link provided is incomplete or not a valid URL format.',
      solution: 'Please paste a complete web link starting with https://',
      canRetry: false,
      retryDelayMs: 0,
      platform,
      domain
    };
  }

  // 2. Text-Only Post (e.g. Reddit discussion threads without media)
  if (err?.isTextPost || lower.includes('text discussion') || lower.includes('no downloadable video or image media')) {
    return {
      category: 'TEXT_POST',
      statusCode: 200,
      badge: `${platform.toUpperCase()} • DISCUSSION`,
      icon: '📝',
      title: 'Text Discussion (No Media)',
      message: 'This post is a text discussion and does not contain any downloadable video, audio, or image media.',
      solution: 'Please paste a link to a post that contains a video, audio track, GIF, or photo.',
      canRetry: false,
      retryDelayMs: 0,
      platform,
      domain
    };
  }

  // 3. Server Busy / Rate Limited / Overload (HTTP 429 / 503 / Concurrency limit)
  const isServerBusy = lower.includes('429') ||
                       lower.includes('too many requests') ||
                       lower.includes('rate limit') ||
                       lower.includes('server busy') ||
                       lower.includes('high traffic') ||
                       lower.includes('server overloaded') ||
                       lower.includes('503 service') ||
                       lower.includes('service temporarily unavailable') ||
                       lower.includes('concurrency_exceeded');

  if (isServerBusy) {
    return {
      category: 'SERVER_BUSY',
      statusCode: 429,
      badge: 'HIGH TRAFFIC',
      icon: '⚡',
      title: 'Server Temporarily Busy',
      message: 'Our servers are currently experiencing high traffic. Too many people are downloading right now. Please try again in a few moments.',
      solution: 'Please wait a few seconds and click Retry to resume your download.',
      canRetry: true,
      retryDelayMs: 5000,
      platform,
      domain
    };
  }

  // 4. Platform Restrictions & Authentication
  const isAntiBot = lower.includes('sign in to confirm you’re not a bot') ||
                    lower.includes('confirm you are human') ||
                    lower.includes('bot protection') ||
                    lower.includes('cloudflare challenge');

  const isDrm = lower.includes('drm protection') ||
                lower.includes('known to use drm') ||
                lower.includes('drm protected');

  if (isDrm) {
    return {
      category: 'PLATFORM_RESTRICTION',
      subCategory: 'DRM_PROTECTION',
      statusCode: 403,
      badge: 'DRM PROTECTED',
      icon: '🔒',
      title: 'DRM Copyright Protection',
      message: 'This media stream is encrypted with Digital Rights Management (DRM) and cannot be downloaded.',
      solution: 'DRM-encrypted subscription streams cannot be captured. Please use public video and audio links.',
      canRetry: false,
      retryDelayMs: 0,
      platform,
      domain
    };
  }

  const isAgeRestricted = lower.includes('age-restricted') ||
                          lower.includes('sign in to confirm your age') ||
                          lower.includes('nsfw') ||
                          lower.includes('inappropriate for some users');

  const isPrivateContent = lower.includes('private video') ||
                           lower.includes('this video is private') ||
                           lower.includes('video is private') ||
                           lower.includes('account is private') ||
                           lower.includes('members-only') ||
                           lower.includes('only available to channel members') ||
                           lower.includes('requires permission');

  const isAuthRequired = lower.includes('account authentication is required') ||
                         lower.includes('login required') ||
                         lower.includes('checkpoint_required') ||
                         lower.includes('please log in') ||
                         lower.includes('http error 403: blocked') ||
                         lower.includes('session request failed: http error 403') ||
                         Boolean(err?.redditAuthError);

  if (isAntiBot) {
    return {
      category: 'PLATFORM_RESTRICTION',
      subCategory: 'BOT_CHECK',
      statusCode: 403,
      badge: `${platform.toUpperCase()} • BOT PROTECTION`,
      icon: '🛡️',
      title: `${capitalize(platform)} Verification Triggered`,
      message: `${capitalize(platform)} is currently presenting an automated bot challenge for unauthenticated access.`,
      solution: platform === 'reddit'
        ? 'Export your Reddit cookies to cookies.txt or your Downloads folder per the official yt-dlp cookies guide.'
        : 'Wait 30-60 seconds or try downloading from another supported platform.',
      officialGuide: 'https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp',
      canRetry: true,
      retryDelayMs: 10000,
      platform,
      domain
    };
  }

  if (isAgeRestricted) {
    return {
      category: 'PLATFORM_RESTRICTION',
      subCategory: 'AGE_RESTRICTED',
      statusCode: 403,
      badge: `${platform.toUpperCase()} • AGE RESTRICTED`,
      icon: '🔞',
      title: 'Age-Restricted Content',
      message: `This ${capitalize(platform)} post is age-restricted and requires account verification by the host platform.`,
      solution: platform === 'reddit'
        ? 'Export your logged-in Reddit cookies into cookies.txt to access age-restricted posts.'
        : 'Ensure your account has access to this content or provide session cookies.',
      officialGuide: 'https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp',
      canRetry: false,
      retryDelayMs: 0,
      platform,
      domain
    };
  }

  if (isPrivateContent) {
    return {
      category: 'PLATFORM_RESTRICTION',
      subCategory: 'PRIVATE_MEDIA',
      statusCode: 403,
      badge: `${platform.toUpperCase()} • PRIVATE`,
      icon: '🔒',
      title: 'Private Media',
      message: `This ${capitalize(platform)} media is private, members-only, or hidden by the content creator.`,
      solution: 'Only public media can be extracted. Verify the privacy settings of the post or channel.',
      canRetry: false,
      retryDelayMs: 0,
      platform,
      domain
    };
  }

  if (isAuthRequired) {
    const cookieStatus = getCookieStatus();
    let guideMsg = `Authentication is required by ${capitalize(platform)} to access this media.`;
    if (platform === 'reddit' && cookieStatus.configured && cookieStatus.isGuestSession) {
      guideMsg = 'Your exported Reddit cookies are active as a Guest Session, but this specific post requires a logged-in account session.';
    }
    return {
      category: 'PLATFORM_RESTRICTION',
      subCategory: 'AUTH_REQUIRED',
      statusCode: 403,
      badge: `${platform.toUpperCase()} • AUTH REQUIRED`,
      icon: '🔑',
      title: `${capitalize(platform)} Authentication Required`,
      message: guideMsg,
      solution: platform === 'reddit'
        ? 'Log into Reddit in your browser, export cookies using Kukiji or "Get cookies.txt LOCALLY", and place in the cookies/ folder.'
        : 'Public access is restricted for this link. You may need to authenticate via cookies.',
      officialGuide: 'https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp',
      canRetry: false,
      retryDelayMs: 0,
      platform,
      domain
    };
  }

  // 5. Link Not Found / Deleted / Unavailable
  const isNotFound = lower.includes('404') ||
                     lower.includes('not found') ||
                     lower.includes('unavailable') ||
                     lower.includes('this video has been removed') ||
                     lower.includes('post has been deleted') ||
                     lower.includes('media not found') ||
                     lower.includes('does not exist') ||
                     lower.includes('could not find') ||
                     lower.includes('unsupported url');

  if (isNotFound) {
    return {
      category: 'LINK_NOT_FOUND',
      statusCode: 404,
      badge: 'NOT FOUND',
      icon: '🔍',
      title: 'Media Link Not Available',
      message: 'The requested video or post could not be found. It may have been deleted, moved, or the link is expired.',
      solution: 'Please verify the URL in your browser or try pasting a different link.',
      canRetry: false,
      retryDelayMs: 0,
      platform,
      domain
    };
  }

  // 6. Network Errors / Timeouts / DNS Failures
  const isNetwork = lower.includes('etimedout') ||
                    lower.includes('econnrefused') ||
                    lower.includes('econnreset') ||
                    lower.includes('enotfound') ||
                    lower.includes('getaddrinfo') ||
                    lower.includes('timed out') ||
                    lower.includes('network is unreachable') ||
                    lower.includes('remote host closed') ||
                    lower.includes('fetch failed') ||
                    lower.includes('504 gateway');

  if (isNetwork) {
    return {
      category: 'NETWORK_ERROR',
      statusCode: 504,
      badge: 'NETWORK BLIP',
      icon: '🌐',
      title: 'Connection Issue',
      message: 'Could not connect to the media host server. This is usually caused by a temporary network timeout or source server interruption.',
      solution: 'Check your internet connection and click Retry to reconnect.',
      canRetry: true,
      retryDelayMs: 3000,
      platform,
      domain
    };
  }

  // 7. Media Processing / Conversion / FFmpeg Errors
  const isProcessingError = lower.includes('ffmpeg') ||
                            lower.includes('postprocessing') ||
                            lower.includes('conversion failed') ||
                            lower.includes('remux') ||
                            lower.includes('moov atom') ||
                            lower.includes('muxing');

  if (isProcessingError) {
    return {
      category: 'PROCESSING_FAILED',
      statusCode: 500,
      badge: 'PROCESSING ERROR',
      icon: '⚙️',
      title: 'Media Conversion Interrupted',
      message: 'The media stream was retrieved but could not be converted or encoded into the requested format.',
      solution: 'Click Retry, or try selecting a standard MP4 or MP3 audio option.',
      canRetry: true,
      retryDelayMs: 2000,
      platform,
      domain
    };
  }

  // 8. General / Fallback Error
  return {
    category: 'DOWNLOAD_FAILED',
    statusCode: 500,
    badge: 'EXTRACTION NOTICE',
    icon: '⚠️',
    title: 'Extraction Could Not Complete',
    message: sanitized.slice(0, 180) || 'Unable to extract playable media streams from this link.',
    solution: 'Please check that the link is public, accessible, and contains media.',
    canRetry: true,
    retryDelayMs: 3000,
    platform,
    domain
  };
}

/**
 * Structured Backend Error Logger
 * Produces secure, structured log entries without exposing cookies,
 * auth tokens, passwords, or full local filesystem paths.
 */
function logStructuredError(eventType, err, targetUrl, extra = {}) {
  const classified = classifyError(err, targetUrl);
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: eventType,
    category: classified.category,
    subCategory: classified.subCategory || null,
    statusCode: classified.statusCode,
    platform: classified.platform,
    domain: classified.domain,
    message: sanitizeCookieOutput(classified.message),
    errorSummary: sanitizeCookieOutput((err?.message || String(err)).slice(0, 200)),
    canRetry: classified.canRetry,
    ...extra
  };
  console.error(`[OMNI LOG] ${JSON.stringify(logEntry)}`);
  return classified;
}

// --------------------------------------------------------------------------
// Specialized Extractor: TikTok via TikWM API (Fast, Watermark-free, 100% reliable)
// --------------------------------------------------------------------------
async function extractTikTok(targetUrl) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(targetUrl)}`;
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const data = await res.json();
  if (data.code !== 0 || !data.data) {
    throw new Error(data.msg || 'Failed to extract TikTok media');
  }

  const d = data.data;
  const videoList = [];
  const audioList = [];

  if (d.play || d.hdplay) {
    videoList.push({
      format_id: 'tiktok_hd_clean',
      selector: d.play || d.hdplay,
      resolution: '1080p HD (No Watermark)',
      label: '1080p HD • Watermark-Free',
      ext: 'mp4',
      filesizeFormatted: formatBytes(d.size) || 'HD Master',
      fps: 60
    });
  }

  if (d.wmplay) {
    videoList.push({
      format_id: 'tiktok_wm',
      selector: d.wmplay,
      resolution: '720p (Original)',
      label: '720p Standard MP4',
      ext: 'mp4',
      filesizeFormatted: 'Standard',
      fps: 30
    });
  }

  if (d.music) {
    audioList.push({
      format_id: 'tiktok_music_mp3',
      selector: d.music,
      quality: 'Original TikTok Audio',
      bitrate: '320 kbps',
      ext: 'mp3',
      filesizeFormatted: 'High Quality MP3'
    });
  }

  return {
    success: true,
    id: d.id,
    title: d.title || 'TikTok Viral Video',
    uploader: d.author ? `${d.author.nickname || ''} (@${d.author.unique_id || ''})` : '@tiktok_creator',
    duration: d.duration || 0,
    durationFormatted: formatDuration(d.duration),
    thumbnail: d.cover || d.origin_cover || null,
    platform: 'tiktok',
    videoFormats: videoList,
    audioFormats: audioList
  };
}

// --------------------------------------------------------------------------
// Specialized Extractor: Spotify via oEmbed + ytsearch1 audio bridge
// --------------------------------------------------------------------------
async function extractSpotify(targetUrl) {
  const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(targetUrl)}`;
  const oembedRes = await fetch(oembedUrl);
  if (!oembedRes.ok) {
    throw new Error('Spotify track not found or invalid URL');
  }
  const oembedData = await oembedRes.json();
  const trackTitle = oembedData.title || 'Spotify Track';
  const thumbnail = oembedData.thumbnail_url || null;

  // Search YouTube for the matching high-quality audio
  const searchQuery = `ytsearch1:${trackTitle} audio`;
  const ytdlpData = await handleYtdlpExtract(searchQuery);

  return {
    ...ytdlpData,
    title: trackTitle,
    uploader: 'Spotify Studio Master',
    thumbnail: thumbnail || ytdlpData.thumbnail,
    platform: 'spotify'
  };
}

// Helper: Case-insensitive & attribute-order-agnostic meta tag content extractor
function getMetaContent(html, key) {
  const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i');
  const r2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
  const m1 = html.match(r1);
  if (m1) return m1[1];
  const m2 = html.match(r2);
  if (m2) return m2[1];
  return null;
}

// --------------------------------------------------------------------------
// Specialized Extractor: Pinterest Video & Image Pins
// --------------------------------------------------------------------------
async function extractPinterest(pinUrl) {
  let pageUrl = pinUrl.trim();

  // If pin.it shortlink, follow and resolve to full pinterest.com/pin/ URL
  if (pageUrl.includes('pin.it')) {
    try {
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        redirect: 'follow'
      });
      pageUrl = res.url;
      const html = await res.text();
      const ogUrl = getMetaContent(html, 'og:url');
      if (ogUrl) {
        pageUrl = ogUrl;
      } else {
        const match = html.match(/href="[^"]*url=([^"&]+)/) || html.match(/href="(https:\/\/[www\.]*pinterest\.com\/pin\/[^"]+)"/);
        if (match) pageUrl = decodeURIComponent(match[1]);
      }
    } catch (e) {
      console.warn('Failed resolving pin.it redirect:', e.message);
    }
  }

  const res = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  const html = await res.text();

  // 1. Title extraction
  let title = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title');
  if (!title) {
    const tMatch = html.match(/<title>([^<]+)<\/title>/);
    title = tMatch ? tMatch[1] : 'Pinterest Media';
  }
  title = title.replace(/\s*\|\s*Pinterest$/, '').trim() || 'Pinterest Media';

  // 2. Creator extraction
  let uploader = 'Pinterest Creator';
  const pinner = getMetaContent(html, 'pinterestapp:pinner');
  if (pinner) {
    const uMatch = pinner.match(/pinterest\.com\/([^\/]+)/);
    if (uMatch) uploader = `@${uMatch[1]}`;
  }

  // 3. Check for video links
  let videoUrl = getMetaContent(html, 'og:video') || getMetaContent(html, 'og:video:secure_url');
  if (!videoUrl) {
    const videoMatches = html.match(/https:\/\/v[0-9]?\.pinimg\.com\/videos\/[a-zA-Z0-9_\-\.\/]+/g) || [];
    if (videoMatches.length > 0) {
      videoUrl = videoMatches[0].replace(/\\u0026/g, '&').replace(/\\/g, '');
    }
  }

  // 4. Check for high-res images
  let thumb = getMetaContent(html, 'og:image') || getMetaContent(html, 'twitter:image:src');
  if (!thumb) {
    const imgMatches = html.match(/https:\/\/i\.pinimg\.com\/(originals|736x)\/[a-zA-Z0-9_\-\.\/]+/g) || [];
    thumb = imgMatches.length > 0 ? imgMatches[0] : null;
  }

  let fullImgUrl = thumb;
  if (thumb && thumb.includes('/736x/')) {
    fullImgUrl = thumb.replace('/736x/', '/originals/');
  }

  if (videoUrl) {
    const mp4Url = videoUrl.replace('/hls/', '/720p/').replace('.m3u8', '.mp4');
    return {
      success: true,
      id: pageUrl,
      title,
      uploader,
      duration: 30,
      durationFormatted: '00:30',
      thumbnail: thumb || fullImgUrl,
      platform: 'pinterest',
      videoFormats: [
        {
          format_id: 'pinterest_720p',
          selector: mp4Url,
          resolution: '720p HD MP4',
          label: 'Pinterest 720p HD Video',
          ext: 'mp4',
          filesizeFormatted: 'Direct Stream',
          fps: 30
        }
      ],
      audioFormats: [
        {
          format_id: 'pinterest_audio',
          selector: mp4Url,
          quality: 'Original Audio (AAC)',
          bitrate: '192 kbps',
          ext: 'm4a',
          filesizeFormatted: 'Direct Audio'
        }
      ]
    };
  }

  if (fullImgUrl) {
    return {
      success: true,
      id: pageUrl,
      title,
      uploader,
      duration: 0,
      durationFormatted: 'High-Res Image',
      thumbnail: fullImgUrl,
      platform: 'pinterest',
      videoFormats: [
        {
          format_id: 'pinterest_photo',
          selector: fullImgUrl,
          resolution: 'Original Quality (Full HD/4K)',
          label: 'Download Original High-Res Image',
          ext: 'jpg',
          filesizeFormatted: 'Direct Master',
          fps: 0
        }
      ],
      audioFormats: []
    };
  }

  throw new Error('Unable to extract Pinterest pin media');
}

// --------------------------------------------------------------------------
// Specialized Extractor: Reddit (Videos via RapidSave / Direct v.redd.it & Images via i.redd.it)
// --------------------------------------------------------------------------
async function extractReddit(targetUrl) {
  let title = 'Reddit Media';
  let uploader = 'Reddit Creator';
  let thumbnail = null;
  const cleanUrl = (targetUrl || '').trim();

  // Direct Reddit CDN link handlers (Bypass RapidSave scraping)
  if (/i\.redd\.it|preview\.redd\.it/i.test(cleanUrl)) {
    const isPng = cleanUrl.toLowerCase().includes('.png');
    const ext = isPng ? 'png' : 'jpg';
    return {
      success: true,
      id: cleanUrl,
      title: 'Reddit High-Res Image',
      uploader: 'Reddit Media Host',
      duration: 0,
      durationFormatted: 'Original Image',
      thumbnail: cleanUrl,
      platform: 'reddit',
      videoFormats: [
        {
          format_id: 'reddit_direct_img',
          selector: cleanUrl,
          resolution: 'Original Master',
          label: 'Download Original High-Res Image',
          ext,
          filesizeFormatted: 'Direct CDN',
          fps: 0
        }
      ],
      audioFormats: []
    };
  }

  if (/packaged-media\.redd\.it|v\.redd\.it/i.test(cleanUrl)) {
    return {
      success: true,
      id: cleanUrl,
      title: 'Reddit Video Stream',
      uploader: 'Reddit Media Host',
      duration: 30,
      durationFormatted: 'HD Video',
      thumbnail: null,
      platform: 'reddit',
      videoFormats: [
        {
          format_id: 'reddit_direct_video',
          selector: cleanUrl,
          resolution: '1080p Full HD',
          label: 'Reddit Video Stream (MP4)',
          ext: 'mp4',
          filesizeFormatted: 'Direct Stream',
          fps: 30
        }
      ],
      audioFormats: []
    };
  }

  // 1. oEmbed for rich metadata (title, author, provider)
  try {
    const oembedUrl = `https://www.reddit.com/oembed?url=${encodeURIComponent(targetUrl)}`;
    const oRes = await fetch(oembedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    if (oRes.ok) {
      const oData = await oRes.json();
      if (oData.title) title = oData.title;
      if (oData.author_name) uploader = `u/${oData.author_name}`;
      if (oData.thumbnail_url) thumbnail = oData.thumbnail_url;
    }
  } catch (oeErr) {
    console.warn('Reddit oEmbed fetch warning:', oeErr.message);
  }

  // 2. RapidSave for direct media resolution (images, v.redd.it videos, audio)
  const rsUrl = `https://rapidsave.com/info?url=${encodeURIComponent(targetUrl)}`;
  const rsRes = await fetch(rsUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!rsRes.ok) {
    throw new Error(`RapidSave service returned HTTP ${rsRes.status}`);
  }

  const html = await rsRes.text();

  // Extract download button target
  const btnMatch = html.match(/class="downloadbutton"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="downloadbutton"/i);
  let dlUrl = btnMatch ? (btnMatch[1] || btnMatch[2]) : null;

  // Check if it's a text-only discussion post pointing back to itself
  const isSelfRedirect = dlUrl && (dlUrl.includes('reddit.com/r/') || dlUrl.includes('reddit.com/comments/'));
  if (isSelfRedirect || (!dlUrl && !html.includes('i.redd.it') && !html.includes('v.redd.it'))) {
    const err = new Error('This Reddit post is a text discussion and does not contain any downloadable video or image media.');
    err.isTextPost = true;
    throw err;
  }

  // Case A: Image post (i.redd.it / preview.redd.it)
  const imageMatch = (dlUrl && dlUrl.match(/https?:\/\/(i|preview)\.redd\.it\/[^\s"']+/i)) ||
                     html.match(/https?:\/\/(i|preview)\.redd\.it\/[a-zA-Z0-9_\-\.\/]+?\.(png|jpg|jpeg|webp)/i);

  if (imageMatch) {
    const imgUrl = (imageMatch[0] || imageMatch[1]).replace(/&amp;/g, '&');
    const ext = imgUrl.toLowerCase().includes('.png') ? 'png' : 'jpg';
    return {
      success: true,
      id: targetUrl,
      title,
      uploader,
      duration: 0,
      durationFormatted: 'High-Res Photo',
      thumbnail: imgUrl,
      platform: 'reddit',
      videoFormats: [
        {
          format_id: 'reddit_photo_original',
          selector: imgUrl,
          resolution: 'Original Quality (Full HD/4K)',
          label: 'Download Original High-Res Image',
          ext,
          filesizeFormatted: 'Direct Image',
          fps: 0
        }
      ],
      audioFormats: []
    };
  }

  // Case B: Video post
  let videoDownloadUrl = null;
  if (dlUrl && (dlUrl.includes('download.php') || dlUrl.includes('v.redd.it') || dlUrl.includes('.mp4'))) {
    videoDownloadUrl = dlUrl;
  } else if (dlUrl && dlUrl.includes('sd.php')) {
    // Resolve sd.php
    const sdFullUrl = dlUrl.startsWith('http') ? dlUrl : `https://rapidsave.com${dlUrl}`;
    const sdRes = await fetch(sdFullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const sdHtml = await sdRes.text();
    const sdMatches = [...sdHtml.matchAll(/href="([^"]*download-sd\.php[^"]*)"/gi)].map(m => m[1]);
    if (sdMatches.length > 0) {
      const hdMatch = sdMatches.find(u => u.includes('DASH_1080') || u.includes('DASH_720')) || sdMatches[0];
      videoDownloadUrl = hdMatch.replace(/&amp;/g, '&');
    }
  }

  if (videoDownloadUrl) {
    return {
      success: true,
      id: targetUrl,
      title,
      uploader,
      duration: 30,
      durationFormatted: '00:30',
      thumbnail: thumbnail || 'https://www.redditstatic.com/icon.png',
      platform: 'reddit',
      videoFormats: [
        {
          format_id: 'reddit_video_hd',
          selector: videoDownloadUrl,
          resolution: '1080p / 720p HD MP4',
          label: 'Reddit HD Video (Direct Stream)',
          ext: 'mp4',
          filesizeFormatted: 'Direct MP4',
          fps: 30
        }
      ],
      audioFormats: [
        {
          format_id: 'reddit_audio',
          selector: videoDownloadUrl,
          quality: 'Original Audio (MP3/AAC)',
          bitrate: '192 kbps',
          ext: 'mp3',
          filesizeFormatted: 'Direct Audio'
        }
      ]
    };
  }

  throw new Error('Unable to extract Reddit media streams');
}

// --------------------------------------------------------------------------
// API Route: Extract Media Metadata via yt-dlp
// --------------------------------------------------------------------------
async function handleYtdlpExtract(targetUrl) {
  const authArgs = getAuthArgs(targetUrl);
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      ...authArgs,
      targetUrl
    ];

    const proc = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => stdout += chunk);
    proc.stderr.on('data', chunk => stderr += chunk);

    proc.on('error', err => reject(err));
    proc.on('close', code => {
      if (code !== 0) {
        const isReddit = /reddit\.com|redd\.it/i.test(targetUrl || '');
        if (isReddit) {
          const redditErr = parseRedditError(stderr, targetUrl);
          if (redditErr) {
            const err = new Error(redditErr.message);
            err.redditAuthError = redditErr;
            return reject(err);
          }
        }
        return reject(new Error(sanitizeCookieOutput(stderr) || `yt-dlp failed with exit code ${code}`));
      }
      try {
        const info = JSON.parse(stdout);

        // Normalize available formats
        const rawFormats = info.formats || [];
        const videoList = [];
        const audioList = [];

        // Common video heights to target
        const targetHeights = [2160, 1440, 1080, 720, 480, 360];
        const seenHeights = new Set();

        for (const h of targetHeights) {
          const match = rawFormats.find(f => f.vcodec !== 'none' && f.height === h);
          if (match && !seenHeights.has(h)) {
            seenHeights.add(h);
            const label = h >= 2160 ? '4K Ultra HD' : h >= 1080 ? '1080p Full HD' : `${h}p HD`;
            const size = match.filesize || match.filesize_approx;
            videoList.push({
              format_id: match.format_id,
              selector: `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`,
              resolution: `${h}p`,
              label,
              ext: 'mp4',
              filesizeFormatted: formatBytes(size) || 'Standard',
              fps: match.fps || 30
            });
          }
        }

        // If no discrete heights found, add generic best video
        if (videoList.length === 0) {
          videoList.push({
            format_id: 'best',
            selector: 'bestvideo+bestaudio/best',
            resolution: info.height ? `${info.height}p` : 'HD',
            label: 'Original Master HD',
            ext: 'mp4',
            filesizeFormatted: formatBytes(info.filesize || info.filesize_approx) || 'Standard',
            fps: info.fps || 30
          });
        }

        // Audio options
        audioList.push({
          format_id: 'mp3_320k',
          selector: 'bestaudio/best',
          quality: 'MP3 Audio (HQ)',
          bitrate: '320 kbps',
          ext: 'mp3',
          filesizeFormatted: formatBytes(Math.round((info.duration || 180) * 40000)) || '8.5 MB'
        });

        audioList.push({
          format_id: 'm4a_256k',
          selector: 'bestaudio[ext=m4a]/bestaudio/best',
          quality: 'M4A Audio (AAC)',
          bitrate: '256 kbps',
          ext: 'm4a',
          filesizeFormatted: formatBytes(Math.round((info.duration || 180) * 32000)) || '6.8 MB'
        });

        audioList.push({
          format_id: 'flac_lossless',
          selector: 'bestaudio/best',
          quality: 'Lossless FLAC',
          bitrate: '24-bit 48kHz',
          ext: 'flac',
          filesizeFormatted: formatBytes(Math.round((info.duration || 180) * 120000)) || '24.2 MB'
        });

        resolve({
          success: true,
          id: info.id,
          title: info.title || 'Extracted Media Stream',
          uploader: info.uploader || info.channel || info.extractor || 'Direct Stream',
          duration: info.duration || 0,
          durationFormatted: formatDuration(info.duration),
          thumbnail: info.thumbnail || null,
          platform: (info.extractor || 'media').toLowerCase(),
          videoFormats: videoList,
          audioFormats: audioList
        });
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

// Master extraction dispatcher
async function handleExtractInfo(targetUrl) {
  const lowerUrl = (targetUrl || '').toLowerCase();

  // 1. TikTok router
  if (lowerUrl.includes('tiktok.com')) {
    try {
      return await extractTikTok(targetUrl);
    } catch (tikErr) {
      console.warn('TikWM extract failed, falling back to yt-dlp:', tikErr.message);
    }
  }

  // 2. Spotify router
  if (lowerUrl.includes('spotify.com') || lowerUrl.includes('spotify.link')) {
    try {
      return await extractSpotify(targetUrl);
    } catch (spotErr) {
      console.warn('Spotify oEmbed extract failed, falling back to yt-dlp:', spotErr.message);
    }
  }

  // 3. Pinterest router (pin.it & pinterest.com)
  if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) {
    try {
      return await extractPinterest(targetUrl);
    } catch (pinErr) {
      console.warn('Pinterest direct extract failed, falling back to yt-dlp:', pinErr.message);
    }
  }

  // 4. Reddit router (reddit.com & redd.it)
  if (lowerUrl.includes('reddit.com') || lowerUrl.includes('redd.it')) {
    try {
      return await extractReddit(targetUrl);
    } catch (rErr) {
      if (rErr.isTextPost) {
        throw rErr; // Avoid yt-dlp fallback on text posts so auth modal is not falsely triggered
      }
      console.warn('Reddit direct extract failed, falling back to yt-dlp:', rErr.message);
    }
  }

  // 5. Native yt-dlp extraction
  return await handleYtdlpExtract(targetUrl);
}

// --------------------------------------------------------------------------
// HTTP Request Dispatcher
// --------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Health check route
  if (pathname === '/api/health') {
    const hasYtdlp = await checkYtdlp();
    const cookieStatus = getCookieStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      ytdlp: hasYtdlp,
      cookies: cookieStatus,
      timestamp: Date.now()
    }));
    return;
  }

  // 1b. Reddit Cookie & Auth Status route
  if (pathname === '/api/reddit-status') {
    const cookieStatus = getCookieStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cookieStatus));
    return;
  }

  // 1c. Real-Time Active Listeners Presence route (Rewind Radio)
  if (pathname === '/api/presence') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      activeListeners: getActiveListenersCount(),
      timestamp: Date.now()
    }));
    return;
  }

  // 1d. Universal Music Discovery Search (YouTube + Spotify + Built-in Catalog)
  if (pathname === '/api/music/search') {
    const q = (parsedUrl.searchParams.get('q') || '').trim();
    const qLower = q.toLowerCase();
    const provider = (parsedUrl.searchParams.get('provider') || 'all').toLowerCase();
    const limit = Math.min(parseInt(parsedUrl.searchParams.get('limit') || '25', 10), 100);
    const offset = Math.max(parseInt(parsedUrl.searchParams.get('offset') || '0', 10), 0);

    // 1. Check in-memory search cache
    const cacheKey = `${provider}:${qLower}`;
    const now = Date.now();
    let allTracks = null;

    if (musicSearchCache.has(cacheKey)) {
      const cached = musicSearchCache.get(cacheKey);
      if (now - cached.timestamp < 3600000) { // 1 hr TTL
        allTracks = cached.tracks;
      } else {
        musicSearchCache.delete(cacheKey);
      }
    }

    if (!allTracks) {
      // Load static catalog
      let catalog = [];
      try {
        const catalogPath = path.join(__dirname, 'rewind_tracks.json');
        if (fs.existsSync(catalogPath)) {
          catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
        }
      } catch (e) {}

      let rawResults = [];

      // Match catalog tracks first
      for (const track of catalog) {
        const titleMatch = (track.title || '').toLowerCase().includes(qLower);
        const artistMatch = (track.artist || '').toLowerCase().includes(qLower);
        const movieMatch = (track.movie || '').toLowerCase().includes(qLower);
        const eraMatch = (track.era || '').toLowerCase().includes(qLower);
        const catMatch = Array.isArray(track.categories) && track.categories.some(c => c.toLowerCase().includes(qLower));

        if (!qLower || titleMatch || artistMatch || movieMatch || eraMatch || catMatch) {
          if (provider === 'all' || provider === 'youtube') {
            rawResults.push({
              id: track.id,
              youtubeId: track.youtubeId,
              title: track.title,
              artist: track.artist,
              album: track.movie || track.era || 'Rewind Radio',
              duration: track.duration,
              durationSeconds: track.durationSeconds,
              artwork: track.artworkHigh || track.artwork,
              provider: 'youtube',
              isPlayable: true,
              categories: track.categories || []
            });
          }

          if (provider === 'all' || provider === 'spotify') {
            rawResults.push({
              id: `sp-${track.id}`,
              youtubeId: track.youtubeId,
              title: track.title,
              artist: track.artist,
              album: track.movie || track.era || 'Rewind Radio',
              duration: track.duration,
              durationSeconds: track.durationSeconds,
              artwork: track.artworkHigh || track.artwork,
              provider: 'spotify',
              spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(track.title + ' ' + track.artist)}`,
              embedUrl: `https://open.spotify.com/embed/track/${track.id}`,
              isPlayable: true,
              categories: track.categories || []
            });
          }
        }
      }

      // If query is present, also fetch dynamic live YouTube tracks!
      if (q && (provider === 'all' || provider === 'youtube' || provider === 'spotify')) {
        try {
          const ytDynamicTracks = await queryDynamicYouTubeTracks(q, 30);
          for (const ytTrack of ytDynamicTracks) {
            if (provider === 'all' || provider === 'youtube') {
              rawResults.push(ytTrack);
            }
            if (provider === 'all' || provider === 'spotify') {
              rawResults.push({
                ...ytTrack,
                id: `sp-${ytTrack.youtubeId}`,
                provider: 'spotify',
                spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(ytTrack.title + ' ' + ytTrack.artist)}`,
                embedUrl: `https://open.spotify.com/embed/track/${ytTrack.youtubeId}`
              });
            }
          }
        } catch (err) {
          console.warn('[SEARCH] Dynamic fetch error:', err.message);
        }
      }

      // Deduplicate by provider + youtubeId or title+artist
      const seen = new Set();
      allTracks = [];
      for (const r of rawResults) {
        const key = `${r.provider}:${r.youtubeId || (r.title.toLowerCase() + ':' + r.artist.toLowerCase())}`;
        if (!seen.has(key)) {
          seen.add(key);
          allTracks.push(r);
        }
      }

      // Cache the full search results
      musicSearchCache.set(cacheKey, { tracks: allTracks, timestamp: now });
    }

    const paginatedTracks = allTracks.slice(offset, offset + limit);
    const hasMore = (offset + limit) < allTracks.length;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      query: q,
      provider,
      total: allTracks.length,
      offset,
      limit,
      hasMore,
      tracks: paginatedTracks,
      hasExternalApiKeys: {
        youtube: Boolean(process.env.YOUTUBE_API_KEY),
        spotify: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
      }
    }));
    return;
  }

  // 1e. Music Autocomplete Suggestions (Google / YouTube Suggestions)
  if (pathname === '/api/music/suggestions') {
    const q = (parsedUrl.searchParams.get('q') || '').trim();
    if (!q) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, query: '', suggestions: [] }));
      return;
    }

    try {
      const suggestUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`;
      const suggestRes = await fetch(suggestUrl);
      if (suggestRes.ok) {
        const data = await suggestRes.json();
        const suggestions = Array.isArray(data[1]) ? data[1] : [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, query: q, suggestions }));
        return;
      }
    } catch (e) {
      console.warn('[SUGGESTIONS] Fetch error:', e.message);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, query: q, suggestions: [] }));
    return;
  }

  // 1f. Smart Multi-Category Random Engine
  if (pathname === '/api/music/random') {
    const category = (parsedUrl.searchParams.get('category') || 'all').toLowerCase();
    const limit = Math.min(parseInt(parsedUrl.searchParams.get('limit') || '20', 10), 50);

    let catalog = [];
    try {
      const catalogPath = path.join(__dirname, 'rewind_tracks.json');
      if (fs.existsSync(catalogPath)) {
        catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      }
    } catch (e) {}

    let matching = [];
    if (category === 'all' || category === 'everything') {
      matching = [...catalog];
    } else {
      matching = catalog.filter(t => {
        const cats = Array.isArray(t.categories) ? t.categories.map(c => c.toLowerCase()) : [];
        const era = (t.era || '').toLowerCase();
        const movie = (t.movie || '').toLowerCase();
        if (category === 'hindi' || category === 'bollywood') {
          return cats.includes('hindi') || cats.includes('bollywood') || cats.includes('retro');
        }
        if (category === 'english' || category === 'pop') {
          return cats.includes('english') || cats.includes('pop') || era.includes('english');
        }
        if (category === 'punjabi' || category === 'desi') {
          return cats.includes('punjabi') || cats.includes('desi');
        }
        if (category === 'retro' || category === '90s') {
          return cats.includes('retro') || cats.includes('90s') || era.includes('90s') || era.includes('80s');
        }
        if (category === 'highway' || category === 'car') {
          return cats.includes('highway') || cats.includes('car');
        }
        return cats.includes(category);
      });
    }

    if (matching.length === 0) matching = [...catalog];

    // Shuffle
    const shuffled = [...matching];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      category,
      total: shuffled.length,
      tracks: shuffled.slice(0, limit)
    }));
    return;
  }

  // 1g. Dynamic Music Sections & Curated Categories (Top Hits, Car Walla, Bike Walla, Random)
  if (pathname === '/api/music/section') {
    const section = (parsedUrl.searchParams.get('section') || 'hits').toLowerCase();
    const filter = (parsedUrl.searchParams.get('filter') || 'all').toLowerCase();
    const limit = Math.min(parseInt(parsedUrl.searchParams.get('limit') || '30', 10), 50);

    const cacheKey = `section:${section}:${filter}`;
    const now = Date.now();

    if (musicSearchCache.has(cacheKey)) {
      const cached = musicSearchCache.get(cacheKey);
      if (now - cached.timestamp < 3600000) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          section,
          filter,
          total: cached.tracks.length,
          tracks: cached.tracks.slice(0, limit),
          fromCache: true
        }));
        return;
      }
    }

    // Map section + filter to intelligent YouTube search query
    const SECTION_QUERIES = {
      hits: {
        all: 'Top Global & Bollywood Trending Hits 2026',
        english: 'Top Global English Pop Hits 2026 Official Audio',
        bollywood: 'Top Bollywood Viral Songs 2026',
        punjabi: 'Top Punjabi Viral Hits 2026 Karan Aujla Diljit Dosanjh'
      },
      car: {
        all: 'Highway Long Drive Car Songs Hindi English',
        highway: 'Highway Driving Bass Beats Songs',
        longdrive: 'Long Drive Bollywood Romantic Songs',
        night: 'Late Night Drive Cruising Songs Synthwave Hindi English',
        bass: 'Car Bass Boosted Driving Songs EDM',
        retro: '90s Bollywood Road Trip Classics',
        romantic: 'Romantic Road Trip Songs Bollywood English'
      },
      bike: {
        all: 'Motorcycle Riding Songs High Energy Adrenaline',
        ridemode: 'Bike Ride Mode Fast Beat Anthems',
        highway: 'Motorcycle Highway Cruiser Rock Electronic',
        night: 'Night Rider Motorcycle Beats Synthwave',
        retrorock: 'Classic Retro Rock Motorcycle Anthems',
        punjabi: 'High Octane Punjabi Bike Riding Songs',
        classics: 'Long Ride Highway Rock Classics'
      },
      random: {
        all: 'Best Worldwide Music Hits 2026',
        desi: 'Top Bollywood Punjabi Anthems 2026',
        global: 'Billboard Hot 100 Hits Official Audio',
        retro: '90s 2000s Nostalgic Hindi Hits',
        energy: 'High Energy Adrenaline Workout Songs',
        chill: 'Chill Acoustic Lo-Fi Aesthetic Songs',
        highway: 'Open Highway Road Trip Anthems'
      }
    };

    const query = (SECTION_QUERIES[section] && SECTION_QUERIES[section][filter])
      ? SECTION_QUERIES[section][filter]
      : `${section} ${filter} music songs`;

    let tracks = [];

    // Pull matching tracks from local catalogue first
    let catalog = [];
    try {
      const catalogPath = path.join(__dirname, 'rewind_tracks.json');
      if (fs.existsSync(catalogPath)) {
        catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      }
    } catch (e) {}

    for (const t of catalog) {
      const titleLower = (t.title || '').toLowerCase();
      const artistLower = (t.artist || '').toLowerCase();
      const langLower = (t.language || '').toLowerCase();
      const cats = Array.isArray(t.categories) ? t.categories.map(c => c.toLowerCase()) : [];

      let match = false;
      if (section === 'hits') {
        if (filter === 'english') match = langLower === 'english';
        else if (filter === 'bollywood') match = langLower === 'hindi' && t.isTrending;
        else if (filter === 'punjabi') match = langLower.includes('punjabi') || artistLower.includes('diljit') || artistLower.includes('karan');
        else match = t.isTrending || cats.includes('top trending mix');
      } else if (section === 'car') {
        if (filter === 'highway') match = cats.includes('highway long drive') || titleLower.includes('blinding') || titleLower.includes('starboy');
        else if (filter === 'longdrive') match = langLower === 'hindi' && (cats.includes('highway long drive') || cats.includes('romantic nostalgia'));
        else if (filter === 'night') match = titleLower.includes('blinding') || titleLower.includes('starboy') || titleLower.includes('tum hi ho');
        else if (filter === 'bass') match = titleLower.includes('tauba') || titleLower.includes('stay') || titleLower.includes('espresso');
        else if (filter === 'retro') match = t.era === '90s' || cats.includes('golden era classics');
        else if (filter === 'romantic') match = cats.includes('romantic nostalgia');
        else match = cats.includes('highway long drive') || t.isTrending || t.era === '90s';
      } else if (section === 'bike') {
        if (filter === 'ridemode') match = titleLower.includes('blinding') || titleLower.includes('starboy') || titleLower.includes('tauba');
        else if (filter === 'highway') match = titleLower.includes('levitating') || titleLower.includes('espresso') || cats.includes('highway long drive');
        else if (filter === 'night') match = titleLower.includes('blinding') || titleLower.includes('stay') || titleLower.includes('birds');
        else if (filter === 'retrorock') match = cats.includes('golden era classics') || artistLower.includes('kishore');
        else if (filter === 'punjabi') match = artistLower.includes('diljit') || artistLower.includes('karan');
        else if (filter === 'classics') match = t.era === '90s' || cats.includes('evergreen hits');
        else match = t.isTrending || cats.includes('highway long drive');
      } else if (section === 'random') {
        match = true;
      }

      if (match) {
        tracks.push({
          id: t.id,
          youtubeId: t.youtubeId,
          title: t.title,
          artist: t.artist,
          album: t.movie || t.era || 'Rewind Radio',
          duration: t.duration || '3:30',
          durationSeconds: t.durationSeconds || 210,
          artwork: t.artworkHigh || t.artwork,
          provider: 'youtube',
          isPlayable: true
        });
      }
    }

    // Now dynamically fetch real live YouTube tracks for this category
    try {
      const ytTracks = await queryDynamicYouTubeTracks(query, 25);
      for (const yt of ytTracks) {
        tracks.push(yt);
      }
    } catch (err) {
      console.warn(`[SECTION API] Dynamic fetch error for ${section}/${filter}:`, err.message);
    }

    // Deduplicate by youtubeId
    const seen = new Set();
    const uniqueTracks = [];
    for (const tr of tracks) {
      const key = tr.youtubeId || (tr.title.toLowerCase() + ':' + tr.artist.toLowerCase());
      if (!seen.has(key)) {
        seen.add(key);
        uniqueTracks.push(tr);
      }
    }

    // Cache
    musicSearchCache.set(cacheKey, { tracks: uniqueTracks, timestamp: now });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      section,
      filter,
      total: uniqueTracks.length,
      tracks: uniqueTracks.slice(0, limit)
    }));
    return;
  }

  // 2. Media Info Extraction Endpoint
  if (pathname === '/api/info' && (req.method === 'POST' || req.method === 'GET')) {
    let targetUrl = parsedUrl.searchParams.get('url');

    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      try {
        const json = JSON.parse(body || '{}');
        targetUrl = json.url || targetUrl;
      } catch (e) {
        // ignore
      }
    }

    if (!targetUrl || targetUrl.trim() === '') {
      const classified = logStructuredError('MISSING_URL', new Error('Missing "url" parameter.'), '');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: classified.message,
        classification: classified
      }));
      return;
    }

    try {
      const data = await handleExtractInfo(targetUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      const classified = logStructuredError('EXTRACTION_ERROR', err, targetUrl);
      res.writeHead(classified.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: classified.message,
        classification: classified
      }));
    }
    return;
  }

  // 3. Media Download & Streaming Endpoint
  if (pathname === '/api/download' && req.method === 'GET') {
    const targetUrl = parsedUrl.searchParams.get('url');
    const selector = parsedUrl.searchParams.get('format') || 'best';
    const mediaType = parsedUrl.searchParams.get('type') || 'video';
    const customTitle = parsedUrl.searchParams.get('title') || 'downloaded_media';
    const reqExt = parsedUrl.searchParams.get('ext');
    const ext = reqExt || (mediaType === 'audio' ? 'mp3' : 'mp4');

    const filename = sanitizeFilename(customTitle, ext);

    // Concurrency limit enforcement (Server Busy Protection)
    if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
      const busyErr = new Error('Server overloaded: too many concurrent downloads in progress');
      const classified = logStructuredError('SERVER_OVERLOADED', busyErr, targetUrl);
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: classified.message,
        classification: classified
      }));
      return;
    }

    activeDownloads++;
    let hasDecremented = false;
    const releaseSlot = () => {
      if (!hasDecremented) {
        hasDecremented = true;
        activeDownloads = Math.max(0, activeDownloads - 1);
      }
    };

    req.on('close', releaseSlot);
    res.on('finish', releaseSlot);
    res.on('close', releaseSlot);

    const contentTypeMap = {
      'mp3': 'audio/mpeg',
      'm4a': 'audio/mp4',
      'flac': 'audio/flac',
      'wav': 'audio/wav',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mkv': 'video/x-matroska',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp'
    };
    const contentType = contentTypeMap[ext.toLowerCase()] || (mediaType === 'audio' ? 'audio/mpeg' : 'video/mp4');

    const FALLBACK_VIDEO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
    const FALLBACK_AUDIO = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

    // Fail-safe fallback streamer for demo samples
    async function streamFallback() {
      try {
        const fbUrl = mediaType === 'audio' ? FALLBACK_AUDIO : FALLBACK_VIDEO;
        const fbRes = await fetch(fbUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (fbRes.ok && fbRes.body) {
          if (!res.headersSent) {
            res.writeHead(200, {
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Content-Type': contentType,
              'Transfer-Encoding': 'chunked',
              'Cache-Control': 'no-cache'
            });
          }
          const { Readable } = await import('node:stream');
          Readable.fromWeb(fbRes.body).pipe(res);
          return;
        }
      } catch (err) {
        console.error('Fallback stream failed:', sanitizeCookieOutput(err.message));
      }
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Download failed.');
      }
    }

    // Case A: Direct HTTP stream URL (from TikWM, direct CDN, Pinterest image, or RapidSave)
    if (selector.startsWith('http://') || selector.startsWith('https://')) {
      try {
        const streamRes = await fetch(selector, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': targetUrl || 'https://www.google.com/'
          }
        });
        if (streamRes.ok && streamRes.body) {
          const rawContentType = streamRes.headers.get('content-type');
          const finalContentType = (rawContentType && !rawContentType.includes('text') && !rawContentType.includes('octet-stream'))
            ? rawContentType
            : contentType;
          const contentLength = streamRes.headers.get('content-length');
          const headers = {
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Type': finalContentType,
            'Cache-Control': 'no-cache'
          };
          if (contentLength) {
            headers['Content-Length'] = contentLength;
          }
          res.writeHead(200, headers);
          const { Readable } = await import('node:stream');
          Readable.fromWeb(streamRes.body).pipe(res);
          return;
        } else {
          throw new Error(`Direct stream source returned HTTP ${streamRes.status}: ${streamRes.statusText}`);
        }
      } catch (proxyErr) {
        releaseSlot();
        const classified = logStructuredError('DIRECT_STREAM_ERROR', proxyErr, targetUrl);
        if (targetUrl) {
          if (!res.headersSent) {
            res.writeHead(classified.statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: classified.message,
              classification: classified
            }));
          }
          return;
        }
        return await streamFallback();
      }
    }

    if (!targetUrl) {
      return await streamFallback();
    }

    // Case B: Universally Playable yt-dlp Video / Audio Pipeline
    // Downloads and remuxes to a temporary file first so FFmpeg writes standard MP4 (ftypisom/avc1/aac) with faststart moov atom!
    let downloadSourceUrl = targetUrl;
    if (/spotify\.com|spotify\.link/i.test(targetUrl)) {
      let searchTitle = (customTitle || '').replace(/_/g, ' ').trim();
      if (!searchTitle || searchTitle.toLowerCase() === 'downloaded media' || searchTitle.toLowerCase() === 'media') {
        try {
          const oRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(targetUrl)}`);
          if (oRes.ok) {
            const oData = await oRes.json();
            if (oData.title) searchTitle = oData.title;
          }
        } catch (e) {}
      }
      downloadSourceUrl = `ytsearch1:${searchTitle} audio`;
    }

    const tmpFile = path.join(os.tmpdir(), `omni_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
    const authArgs = getAuthArgs(targetUrl);

    let dlArgs = [];
    if (mediaType === 'audio') {
      dlArgs = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        ...authArgs,
        '-o', tmpFile,
        '--no-warnings',
        '--no-playlist',
        downloadSourceUrl
      ];
    } else {
      // Force H.264 (avc1) video + AAC audio muxed into true, standard ISOBMFF MP4 that plays in Windows Media Player & all devices!
      let sortSpec = 'vcodec:h264,res,acodec:m4a';
      const heightMatch = (selector || '').match(/height<=?(\d+)/);
      if (heightMatch) {
        sortSpec = `res:${heightMatch[1]},vcodec:h264,acodec:m4a`;
      }
      dlArgs = [
        '-S', sortSpec,
        '-f', 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best',
        '--remux-video', 'mp4',
        '--postprocessor-args', 'ffmpeg:-movflags +faststart',
        ...authArgs,
        '-o', tmpFile,
        '--no-warnings',
        '--no-playlist',
        downloadSourceUrl
      ];
    }

    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('yt-dlp', dlArgs);
        let errBuf = '';
        proc.stderr.on('data', d => errBuf += d);
        proc.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(sanitizeCookieOutput(errBuf) || `yt-dlp exited with code ${code}`));
        });
        proc.on('error', err => reject(err));
        req.on('close', () => {
          proc.kill('SIGTERM');
          try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) {}
        });
      });

      // Stream the genuine, playable file with exact Content-Length
      let resolvedFile = tmpFile;
      if (!fs.existsSync(resolvedFile)) {
        const dir = path.dirname(tmpFile);
        const base = path.basename(tmpFile, path.extname(tmpFile));
        const found = fs.readdirSync(dir).find(f => f.startsWith(base) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
        if (found) {
          resolvedFile = path.join(dir, found);
        }
      }
      if (!fs.existsSync(resolvedFile)) {
        throw new Error('Downloaded file was not created by media pipeline.');
      }

      const stat = fs.statSync(resolvedFile);
      res.writeHead(200, {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache'
      });

      const fileStream = fs.createReadStream(resolvedFile);
      fileStream.pipe(res);
      fileStream.on('close', () => {
        try { fs.unlinkSync(resolvedFile); } catch (e) {}
      });
      return;
    } catch (ytdlpErr) {
      releaseSlot();
      const classified = logStructuredError('DOWNLOAD_ENCODE_ERROR', ytdlpErr, targetUrl);
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) {}
      
      // If client requested an actual user URL, return accurate error classification
      if (targetUrl) {
        if (!res.headersSent) {
          res.writeHead(classified.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: classified.message,
            classification: classified
          }));
        }
        return;
      }
      return await streamFallback();
    }
  }

  // 4. Static File Server
  let filePath = decodeURIComponent(pathname);
  if (filePath === '/' || filePath === '') {
    filePath = '/index.html';
  }

  const safePath = path.join(__dirname, filePath);

  if (!safePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
});

// --------------------------------------------------------------------------
// WebSocket Server for Rewind Radio Real-Time Presence & Activity
// --------------------------------------------------------------------------
const wss = WebSocketServer ? new WebSocketServer({ noServer: true }) : null;

if (wss) {
  wss.on('connection', (ws, req) => {
  let clientSessionId = null;

  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    clientSessionId = reqUrl.searchParams.get('sessionId');
  } catch (e) {}

  if (!clientSessionId) {
    clientSessionId = `sess_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
  }

  // Register session (deduplicated by sessionId)
  let session = activeSessions.get(clientSessionId);
  if (!session) {
    session = { sockets: new Set(), lastSeen: Date.now(), ip: req.socket.remoteAddress };
    activeSessions.set(clientSessionId, session);
  }
  session.sockets.add(ws);
  session.lastSeen = Date.now();

  // Send initial welcome & presence to connecting client
  try {
    ws.send(JSON.stringify({
      type: 'welcome',
      sessionId: clientSessionId,
      activeListeners: getActiveListenersCount(),
      timestamp: Date.now()
    }));
  } catch (e) {}

  // Broadcast updated count across all connected listeners
  broadcastPresence();

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (session) session.lastSeen = Date.now();

      if (msg.type === 'ping') {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } else if (msg.type === 'init') {
        if (msg.sessionId && msg.sessionId !== clientSessionId) {
          // migrate socket to client-persisted sessionId
          if (session) {
            session.sockets.delete(ws);
            if (session.sockets.size === 0) activeSessions.delete(clientSessionId);
          }
          clientSessionId = msg.sessionId;
          session = activeSessions.get(clientSessionId);
          if (!session) {
            session = { sockets: new Set(), lastSeen: Date.now(), ip: req.socket.remoteAddress };
            activeSessions.set(clientSessionId, session);
          }
          session.sockets.add(ws);
          session.lastSeen = Date.now();
          broadcastPresence();
        }
      } else if (msg.type === 'activity') {
        const safeMessage = typeof msg.message === 'string' ? msg.message.slice(0, 150) : null;
        if (safeMessage) {
          broadcastActivity(safeMessage, clientSessionId);
        }
      }
    } catch (err) {
      // Ignore invalid JSON payloads
    }
  });

  const handleDisconnect = () => {
    if (session) {
      session.sockets.delete(ws);
      if (session.sockets.size === 0) {
        activeSessions.delete(clientSessionId);
      }
    }
    broadcastPresence();
  };

  ws.on('close', handleDisconnect);
  ws.on('error', handleDisconnect);
});
}

server.on('upgrade', (req, socket, head) => {
  if (!wss) {
    socket.destroy();
    return;
  }
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (parsedUrl.pathname === '/ws/presence' || parsedUrl.pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`OMNI Downloader server listening on http://${HOST}:${PORT}`);
});
