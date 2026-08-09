/**
 * KitaShare Relay Server - Session store
 * In-memory session management with auto-expiry
 */

import { sanitizeNickname, sanitizeChatMessage, sanitizeAvatar, sanitizeBio } from './security';

export interface ChatEntry {
  user: string;
  text: string;
  timestamp: number;
  subtype: string;
}

export interface SessionData {
  sessionId: string;
  width: number;
  height: number;
  fps: number;
  hostName: string;
  hostAvatar: string;
  hostBio: string;
  lastFrame: Buffer | null;
  lastFrameTime: number;
  frameCount: number;
  chatHistory: ChatEntry[];
  viewers: Set<import('http').ServerResponse>;
  viewerCount: number;
  totalViewers: number;
  createdAt: number;
  lastActivity: number;
  files: Array<{ id: number; name: string; size: number }>;
  fileContents: Map<number, Buffer>;
}

const SESSIONS = new Map<string, SessionData>();
const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_CHAT_HISTORY = 200;
const MAX_VIEWERS_PER_SESSION = 50;
const MAX_SESSIONS = 100;

export function createSession(sessionId: string, info: {
  width: number;
  height: number;
  fps: number;
  hostName: string;
  hostAvatar: string;
  hostBio: string;
}): SessionData {
  // Evict oldest session if at capacity
  if (SESSIONS.size >= MAX_SESSIONS) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, session] of SESSIONS) {
      if (session.lastActivity < oldestTime) {
        oldestTime = session.lastActivity;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      cleanupSession(oldestKey);
    }
  }

  const session: SessionData = {
    sessionId,
    width: info.width,
    height: info.height,
    fps: info.fps,
    hostName: sanitizeNickname(info.hostName),
    hostAvatar: sanitizeAvatar(info.hostAvatar),
    hostBio: sanitizeBio(info.hostBio),
    lastFrame: null,
    lastFrameTime: 0,
    frameCount: 0,
    chatHistory: [],
    viewers: new Set(),
    viewerCount: 0,
    totalViewers: 0,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    files: [],
    fileContents: new Map(),
  };

  SESSIONS.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionData | null {
  return SESSIONS.get(sessionId) || null;
}

export function deleteSession(sessionId: string): void {
  cleanupSession(sessionId);
}

function cleanupSession(sessionId: string): void {
  const session = SESSIONS.get(sessionId);
  if (session) {
    // Close all SSE connections
    for (const res of session.viewers) {
      try { res.end(); } catch {}
    }
    session.viewers.clear();
    SESSIONS.delete(sessionId);
  }
}

export function addViewer(sessionId: string, res: import('http').ServerResponse): boolean {
  const session = getSession(sessionId);
  if (!session) return false;
  if (session.viewers.size >= MAX_VIEWERS_PER_SESSION) return false;

  session.viewers.add(res);
  session.viewerCount = session.viewers.size;
  session.totalViewers++;
  session.lastActivity = Date.now();
  return true;
}

export function removeViewer(sessionId: string, res: import('http').ServerResponse): void {
  const session = getSession(sessionId);
  if (session) {
    session.viewers.delete(res);
    session.viewerCount = session.viewers.size;
    session.lastActivity = Date.now();
  }
}

export function updateFrame(sessionId: string, frame: Buffer): void {
  const session = getSession(sessionId);
  if (!session) return;

  session.lastFrame = frame;
  session.lastFrameTime = Date.now();
  session.frameCount++;
  session.lastActivity = Date.now();

  // Broadcast to all SSE viewers
  const base64 = frame.toString('base64');
  const payload = `data: ${JSON.stringify({ type: 'frame', data: base64 })}\n\n`;
  const dead: import('http').ServerResponse[] = [];

  for (const res of session.viewers) {
    try {
      res.write(payload);
    } catch {
      dead.push(res);
    }
  }

  // Cleanup dead connections
  for (const res of dead) {
    session.viewers.delete(res);
  }
  session.viewerCount = session.viewers.size;
}

export function addChatMessage(sessionId: string, msg: ChatEntry): void {
  const session = getSession(sessionId);
  if (!session) return;

  const cleanMsg: ChatEntry = {
    user: sanitizeNickname(msg.user),
    text: sanitizeChatMessage(msg.text),
    timestamp: msg.timestamp,
    subtype: msg.subtype || '',
  };

  session.chatHistory.push(cleanMsg);
  if (session.chatHistory.length > MAX_CHAT_HISTORY) {
    session.chatHistory.shift();
  }
  session.lastActivity = Date.now();

  // Broadcast to all SSE viewers
  const payload = `data: ${JSON.stringify({ type: 'chat', ...cleanMsg })}\n\n`;
  const dead: import('http').ServerResponse[] = [];

  for (const res of session.viewers) {
    try {
      res.write(payload);
    } catch {
      dead.push(res);
    }
  }

  for (const res of dead) {
    session.viewers.delete(res);
  }
  session.viewerCount = session.viewers.size;
}

export function broadcastRaiseHand(sessionId: string, user: string, timestamp: number): void {
  const session = getSession(sessionId);
  if (!session) return;

  const cleanUser = sanitizeNickname(user);

  // Add to chat history so host can see it via chat polling
  const chatEntry: ChatEntry = {
    user: cleanUser,
    text: 'raised their hand',
    timestamp,
    subtype: 'raise_hand',
  };
  session.chatHistory.push(chatEntry);
  if (session.chatHistory.length > MAX_CHAT_HISTORY) {
    session.chatHistory.shift();
  }
  session.lastActivity = Date.now();

  // Broadcast to all SSE viewers
  const payload = `data: ${JSON.stringify({ type: 'raise_hand', user: cleanUser, timestamp })}\n\n`;
  const dead: import('http').ServerResponse[] = [];

  for (const res of session.viewers) {
    try {
      res.write(payload);
    } catch {
      dead.push(res);
    }
  }

  for (const res of dead) {
    session.viewers.delete(res);
  }
  session.viewerCount = session.viewers.size;
}

export function updateSessionInfo(sessionId: string, info: {
  width?: number;
  height?: number;
  fps?: number;
  hostName?: string;
  hostAvatar?: string;
  hostBio?: string;
}): void {
  const session = getSession(sessionId);
  if (!session) return;

  let profileChanged = false;
  if (info.width !== undefined) session.width = info.width;
  if (info.height !== undefined) session.height = info.height;
  if (info.fps !== undefined) session.fps = info.fps;
  if (info.hostName !== undefined) { session.hostName = sanitizeNickname(info.hostName) || 'Host'; profileChanged = true; }
  if (info.hostAvatar !== undefined) { session.hostAvatar = sanitizeAvatar(info.hostAvatar); profileChanged = true; }
  if (info.hostBio !== undefined) { session.hostBio = sanitizeBio(info.hostBio); profileChanged = true; }
  session.lastActivity = Date.now();

  // Notify viewers of host profile change
  if (profileChanged) {
    const payload = `data: ${JSON.stringify({ type: 'host', host: { name: session.hostName, avatar: session.hostAvatar, bio: session.hostBio } })}\n\n`;
    for (const res of session.viewers) {
      try { res.write(payload); } catch {}
    }
  }
}

export function updateFiles(sessionId: string, files: Array<{ id: number; name: string; size: number }>): void {
  const session = getSession(sessionId);
  if (!session) return;
  session.files = files;
  // Remove file contents for files no longer in the list
  const currentIds = new Set(files.map(f => f.id));
  for (const key of session.fileContents.keys()) {
    if (!currentIds.has(key)) {
      session.fileContents.delete(key);
    }
  }
  session.lastActivity = Date.now();

  // Notify viewers
  const payload = `data: ${JSON.stringify({ type: 'files', files })}\n\n`;
  for (const res of session.viewers) {
    try { res.write(payload); } catch {}
  }
}

export function setFileContent(sessionId: string, fileId: number, data: Buffer): boolean {
  const session = getSession(sessionId);
  if (!session) return false;
  session.fileContents.set(fileId, data);
  session.lastActivity = Date.now();
  return true;
}

export function getFileContent(sessionId: string, fileId: number): Buffer | null {
  const session = getSession(sessionId);
  if (!session) return null;
  return session.fileContents.get(fileId) || null;
}

// Auto-expire sessions
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of SESSIONS) {
    if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
      cleanupSession(sessionId);
    }
  }
}, 60_000).unref();

export function getActiveSessionCount(): number {
  return SESSIONS.size;
}
