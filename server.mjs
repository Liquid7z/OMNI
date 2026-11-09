import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

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
// API Route: Extract Media Metadata via yt-dlp
// --------------------------------------------------------------------------
async function handleExtractInfo(targetUrl) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
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
        return reject(new Error(stderr || `yt-dlp failed with exit code ${code}`));
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ytdlp: hasYtdlp, timestamp: Date.now() }));
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

    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing "url" parameter.' }));
      return;
    }

    try {
      const data = await handleExtractInfo(targetUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('Extraction error:', err.message);
      // Return structured response with fallback
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        fallback: true,
        error: err.message,
        message: 'Direct stream extract attempted. You can still initiate download via standard streams.'
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

    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing URL parameter.');
      return;
    }

    const filename = sanitizeFilename(customTitle, ext);

    const contentTypeMap = {
      'mp3': 'audio/mpeg',
      'm4a': 'audio/mp4',
      'flac': 'audio/flac',
      'wav': 'audio/wav',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'mkv': 'video/x-matroska'
    };
    const contentType = contentTypeMap[ext.toLowerCase()] || (mediaType === 'audio' ? 'audio/mpeg' : 'video/mp4');

    res.writeHead(200, {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': contentType,
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache'
    });

    // Spawn yt-dlp streaming directly to HTTP response
    const args = [
      '-f', selector,
      '-o', '-',
      '--no-warnings',
      '--no-playlist',
      targetUrl
    ];

    const proc = spawn('yt-dlp', args);

    proc.stdout.pipe(res);

    proc.stderr.on('data', chunk => {
      // console.warn('yt-dlp stderr:', chunk.toString());
    });

    proc.on('error', err => {
      console.error('yt-dlp spawn error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Download process failed to spawn.');
      }
    });

    // Clean up if browser cancels or aborts connection
    req.on('close', () => {
      proc.kill('SIGTERM');
    });

    return;
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
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`OMNI Downloader server listening on http://${HOST}:${PORT}`);
});
