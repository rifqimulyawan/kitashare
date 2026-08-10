/**
 * KitaShare Relay Server
 * SSE-based relay for internet screen sharing
 *
 * Endpoints:
 *   POST /api/publish/:sessionId/start   - Publisher starts session
 *   POST /api/publish/:sessionId/frame   - Publisher sends frame
 *   POST /api/publish/:sessionId/stop    - Publisher stops session
 *   POST /api/publish/:sessionId/info    - Publisher updates session info
 *   POST /api/publish/:sessionId/files   - Publisher updates file list
 *   POST /api/chat/:sessionId            - Viewer sends chat
 *   POST /api/raise/:sessionId           - Viewer raises hand
 *   GET  /stream/:sessionId              - Viewer SSE stream
 *   GET  /api/info/:sessionId            - Get session info
 *   GET  /api/files/:sessionId           - Get file list
 *   GET  /health                         - Health check
 *   GET  /                               - Serve viewer HTML
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import {
  isValidSessionId,
  verifyPublisherToken,
  sanitizeNickname,
  sanitizeChatMessage,
  sanitizeAvatar,
  sanitizeBio,
  checkRateLimit,
  checkRateLimitKey,
  getClientIP,
  setCorsHeaders,
  setSecurityHeaders,
} from './security';
import {
  createSession,
  getSession,
  deleteSession,
  pauseSession,
  resumeSession,
  addViewer,
  removeViewer,
  updateFrame,
  addChatMessage,
  broadcastRaiseHand,
  updateSessionInfo,
  updateFiles,
  setFileContent,
  getFileContent,
  getActiveSessionCount,
} from './session';

const PORT = parseInt(process.env.PORT || '3000', 10);
const VIEWER_HTML_PATH = path.join(__dirname, 'viewer.html');

// Rate limits
const RATE_PUBLISH = 120;   // 120 POST /frame per minute (2fps at 60fps burst)
const RATE_VIEWER = 60;     // 60 requests per minute
const RATE_CHAT = 30;        // 30 chat messages per minute

function sendJSON(res: http.ServerResponse, status: number, data: unknown): void {
  setSecurityHeaders(res);
  setCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJSON(res, status, { error: message });
}

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > maxBytes) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '/';
  const method = req.method || 'GET';
  const ip = getClientIP(req);

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    setCorsHeaders(res);
    setSecurityHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // --- Health check ---
  if (pathname === '/health') {
    sendJSON(res, 200, {
      status: 'ok',
      sessions: getActiveSessionCount(),
      uptime: process.uptime(),
    });
    return;
  }

  // --- Route matching ---
  const parts = pathname.split('/').filter(Boolean);

  // --- Serve viewer HTML at root or /view/:sessionId ---
  if ((pathname === '/' && method === 'GET') ||
      (parts.length === 2 && parts[0] === 'view' && method === 'GET')) {
    setSecurityHeaders(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.readFile(VIEWER_HTML_PATH, (err, data) => {
      if (err) {
        res.end('<html><body><h2>KitaShare Relay</h2><p>Viewer file not found.</p></body></html>');
      } else {
        res.end(data);
      }
    });
    return;
  }

  // /stream/:sessionId — SSE viewer stream
  if (parts.length === 2 && parts[0] === 'stream' && method === 'GET') {
    const sessionId = parts[1];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    if (!checkRateLimitKey(ip + ':viewer', RATE_VIEWER)) {
      sendError(res, 429, 'Rate limited');
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }

    // Setup SSE
    setSecurityHeaders(res);
    setCorsHeaders(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial info
    const initPayload = `data: ${JSON.stringify({
      type: 'info',
      width: session.width,
      height: session.height,
      fps: session.fps,
      host: {
        name: session.hostName,
        avatar: session.hostAvatar,
        bio: session.hostBio,
      },
      viewerCount: session.viewerCount,
    })}\n\n`;
    res.write(initPayload);

    // Send last frame if available
    if (session.lastFrame) {
      const framePayload = `data: ${JSON.stringify({
        type: 'frame',
        data: session.lastFrame.toString('base64'),
      })}\n\n`;
      res.write(framePayload);
    }

    // Send chat history
    if (session.chatHistory.length > 0) {
      const recent = session.chatHistory.slice(-50);
      const historyPayload = `data: ${JSON.stringify({ type: 'chat_history', messages: recent })}\n\n`;
      res.write(historyPayload);
    }

    // Send file list
    if (session.files.length > 0) {
      const filesPayload = `data: ${JSON.stringify({ type: 'files', files: session.files })}\n\n`;
      res.write(filesPayload);
    }

    // If session is paused, notify viewer
    if (session.paused) {
      res.write(`data: ${JSON.stringify({ type: 'stream_paused' })}\n\n`);
    }

    // Add viewer to session
    if (!addViewer(sessionId, res)) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Session full' })}\n\n`);
      res.end();
      return;
    }

    // Heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 15_000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      removeViewer(sessionId, res);
    });

    return;
  }

  // /api/info/:sessionId — get session info
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'info' && method === 'GET') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }

    sendJSON(res, 200, {
      width: session.width,
      height: session.height,
      fps: session.fps,
      clients: session.viewerCount,
      host: {
        name: session.hostName,
        avatar: session.hostAvatar,
        bio: session.hostBio,
      },
      files: session.files.length,
      paused: session.paused,
    });
    return;
  }

  // /api/files/:sessionId — get file list
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'files' && method === 'GET') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }

    sendJSON(res, 200, { files: session.files });
    return;
  }

  // /api/files/:sessionId/:fileId — viewer downloads a file
  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'files' && method === 'GET') {
    const sessionId = parts[2];
    const fileId = parseInt(parts[3], 10);
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }

    const file = session.files.find(f => f.id === fileId);
    if (!file) {
      sendError(res, 404, 'File not found');
      return;
    }

    const content = getFileContent(sessionId, fileId);
    if (!content) {
      sendError(res, 404, 'File content not available');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.name.replace(/"/g, '\\"')}"`,
      'Content-Length': content.length,
    });
    res.end(content);
    return;
  }

  // /api/publish/:sessionId/files/:fileId — publisher uploads file content
  if (parts.length === 5 && parts[0] === 'api' && parts[1] === 'publish' && parts[3] === 'files' && method === 'POST') {
    const sessionId = parts[2];
    const fileId = parseInt(parts[4], 10);
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const publisherToken = req.headers['x-publisher-token'] as string || '';
    if (!publisherToken || !verifyPublisherToken(sessionId, publisherToken)) {
      sendError(res, 403, 'Unauthorized: invalid publisher token');
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }

    const file = session.files.find(f => f.id === fileId);
    if (!file) {
      sendError(res, 404, 'File not in shared list');
      return;
    }

    try {
      // Max 50MB per file
      const body = await readBody(req, 50 * 1024 * 1024);
      setFileContent(sessionId, fileId, body);
      sendJSON(res, 200, { ok: true });
    } catch {
      sendError(res, 400, 'File too large or invalid');
    }
    return;
  }

  // /api/publish/:sessionId/start — publisher starts session
  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'publish' && parts[3] === 'start' && method === 'POST') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const publisherToken = req.headers['x-publisher-token'] as string || '';
    if (!publisherToken || !verifyPublisherToken(sessionId, publisherToken)) {
      sendError(res, 403, 'Unauthorized: invalid publisher token');
      return;
    }

    if (!checkRateLimitKey(ip + ':start', 30)) {
      sendError(res, 429, 'Rate limited');
      return;
    }

    try {
      const body = await readBody(req, 256 * 1024);
      const info = JSON.parse(body.toString());

      // If session exists and is paused, resume it (preserves chat history & files)
      const existing = getSession(sessionId);
      if (existing) {
        if (existing.paused) {
          resumeSession(sessionId, {
            width: info.width || 1920,
            height: info.height || 1080,
            fps: info.fps || 30,
            hostName: info.hostName || 'Host',
            hostAvatar: info.hostAvatar || '',
            hostBio: info.hostBio || '',
          });
        } else {
          // Session is active — delete and recreate (re-publish)
          deleteSession(sessionId);
          createSession(sessionId, {
            width: info.width || 1920,
            height: info.height || 1080,
            fps: info.fps || 30,
            hostName: info.hostName || 'Host',
            hostAvatar: sanitizeAvatar(info.hostAvatar || ''),
            hostBio: sanitizeBio(info.hostBio || ''),
          });
        }
      } else {
        createSession(sessionId, {
          width: info.width || 1920,
          height: info.height || 1080,
          fps: info.fps || 30,
          hostName: info.hostName || 'Host',
          hostAvatar: sanitizeAvatar(info.hostAvatar || ''),
          hostBio: sanitizeBio(info.hostBio || ''),
        });
      }

      sendJSON(res, 200, {
        ok: true,
        streamUrl: `/stream/${sessionId}`,
        viewerUrl: `/view/${sessionId}`,
      });
    } catch {
      sendError(res, 400, 'Invalid request body');
    }
    return;
  }

  // /api/publish/:sessionId/frame — publisher sends frame
  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'publish' && parts[3] === 'frame' && method === 'POST') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const publisherToken = req.headers['x-publisher-token'] as string || '';
    if (!publisherToken || !verifyPublisherToken(sessionId, publisherToken)) {
      sendError(res, 403, 'Unauthorized: invalid publisher token');
      return;
    }

    if (!checkRateLimitKey(ip + ':frame', RATE_PUBLISH)) {
      sendError(res, 429, 'Rate limited');
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }

    try {
      // Max 2MB per frame (JPEG at high quality)
      const body = await readBody(req, 2 * 1024 * 1024);
      updateFrame(sessionId, body);
      sendJSON(res, 200, { ok: true, viewers: session.viewerCount });
    } catch {
      sendError(res, 400, 'Frame too large or invalid');
    }
    return;
  }

  // /api/publish/:sessionId/info — publisher updates info
  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'publish' && parts[3] === 'info' && method === 'POST') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const publisherToken = req.headers['x-publisher-token'] as string || '';
    if (!publisherToken || !verifyPublisherToken(sessionId, publisherToken)) {
      sendError(res, 403, 'Unauthorized: invalid publisher token');
      return;
    }

    try {
      const body = await readBody(req, 256 * 1024);
      const info = JSON.parse(body.toString());
      if (info.hostAvatar !== undefined) info.hostAvatar = sanitizeAvatar(info.hostAvatar);
      if (info.hostBio !== undefined) info.hostBio = sanitizeBio(info.hostBio);
      updateSessionInfo(sessionId, info);
      sendJSON(res, 200, { ok: true });
    } catch {
      sendError(res, 400, 'Invalid request body');
    }
    return;
  }

  // /api/publish/:sessionId/files — publisher updates file list
  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'publish' && parts[3] === 'files' && method === 'POST') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const publisherToken = req.headers['x-publisher-token'] as string || '';
    if (!publisherToken || !verifyPublisherToken(sessionId, publisherToken)) {
      sendError(res, 403, 'Unauthorized: invalid publisher token');
      return;
    }

    try {
      const body = await readBody(req, 16384);
      const data = JSON.parse(body.toString());
      updateFiles(sessionId, data.files || []);
      sendJSON(res, 200, { ok: true });
    } catch {
      sendError(res, 400, 'Invalid request body');
    }
    return;
  }

  // /api/publish/:sessionId/stop — publisher stops session
  if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'publish' && parts[3] === 'stop' && method === 'POST') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const publisherToken = req.headers['x-publisher-token'] as string || '';
    if (!publisherToken || !verifyPublisherToken(sessionId, publisherToken)) {
      sendError(res, 403, 'Unauthorized: invalid publisher token');
      return;
    }

    // Pause session instead of deleting — preserves chat history and files for reconnection
    pauseSession(sessionId);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // /api/chat/:sessionId — viewer sends chat
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'chat' && method === 'POST') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    if (!checkRateLimitKey(ip + ':chat', RATE_CHAT)) {
      sendError(res, 429, 'Rate limited');
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }

    try {
      const body = await readBody(req, 4096);
      const data = JSON.parse(body.toString());

      if (!data.text || data.text.trim().length === 0) {
        sendError(res, 400, 'Empty message');
        return;
      }

      addChatMessage(sessionId, {
        user: data.user || 'Guest',
        text: data.text,
        timestamp: Date.now(),
        subtype: data.subtype || '',
      });

      sendJSON(res, 200, { ok: true });
    } catch {
      sendError(res, 400, 'Invalid request body');
    }
    return;
  }

  // /api/chat/:sessionId — host polls chat messages (GET)
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'chat' && method === 'GET') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }

    const since = parseInt((parsedUrl.query.since as string) || '0', 10);
    const messages = session.chatHistory.filter(m => m.timestamp > since);
    sendJSON(res, 200, { messages });
    return;
  }

  // /api/raise/:sessionId — viewer raises hand
  if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'raise' && method === 'POST') {
    const sessionId = parts[2];
    if (!isValidSessionId(sessionId)) {
      sendError(res, 400, 'Invalid session ID');
      return;
    }

    if (!checkRateLimitKey(ip + ':raise', RATE_CHAT)) {
      sendError(res, 429, 'Rate limited');
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      sendError(res, 404, 'Session not found');
      return;
    }

    try {
      const body = await readBody(req, 2048);
      const data = JSON.parse(body.toString());

      broadcastRaiseHand(sessionId, data.user || 'Guest', Date.now());
      sendJSON(res, 200, { ok: true });
    } catch {
      sendError(res, 400, 'Invalid request body');
    }
    return;
  }

  // 404
  sendError(res, 404, 'Not found');
}

// --- Create server ---
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      sendError(res, 500, 'Internal server error');
    }
  });
});

server.listen(PORT, () => {
  console.log(`KitaShare relay server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});
