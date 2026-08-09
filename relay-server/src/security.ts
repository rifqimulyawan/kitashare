/**
 * KitaShare Relay Server - Security utilities
 * Input validation, rate limiting, session token management
 */

import crypto from 'crypto';

// --- Session ID validation ---
const SESSION_ID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_REGEX.test(id);
}

// --- Publisher token validation ---
// Token = HMAC-SHA256(sessionId + secret, timestamp) — publisher must send this
const PUBLISHER_SECRET = process.env.KITASHARE_RELAY_SECRET || crypto.randomBytes(32).toString('hex');

export function generatePublisherToken(sessionId: string): string {
  return crypto.createHmac('sha256', PUBLISHER_SECRET).update(sessionId).digest('hex');
}

export function verifyPublisherToken(sessionId: string, token: string): boolean {
  const expected = generatePublisherToken(sessionId);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

// --- Nickname sanitization ---
export function sanitizeNickname(name: string): string {
  const cleaned = name.trim().slice(0, 30);
  // Strip HTML/control chars
  return cleaned.replace(/[<>&"'`\x00-\x1f]/g, '');
}

// --- Chat message sanitization ---
export function sanitizeChatMessage(msg: string): string {
  return msg.trim().slice(0, 2000).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

// --- Avatar URL sanitization ---
const ALLOWED_AVATAR_PROTOCOLS = ['https:', 'data:'];
export function sanitizeAvatar(url: string): string {
  const cleaned = url.trim().slice(0, 500);
  if (cleaned === '') return '';
  try {
    const parsed = new URL(cleaned);
    if (!ALLOWED_AVATAR_PROTOCOLS.includes(parsed.protocol)) return '';
    if (parsed.protocol === 'data:' && !cleaned.startsWith('data:image/')) return '';
    return cleaned;
  } catch {
    return '';
  }
}

// --- Bio sanitization ---
export function sanitizeBio(bio: string): string {
  return bio.trim().slice(0, 200).replace(/[<>&"'`\x00-\x1f]/g, '');
}

// --- Rate limiter (token bucket per IP) ---
interface Bucket {
  tokens: number;
  lastRefill: number;
}

const RATE_BUCKETS = new Map<string, Bucket>();
const RATE_INTERVAL_MS = 60_000; // 1 minute window

export function checkRateLimit(ip: string, maxRequests: number): boolean {
  return checkRateLimitKey(ip, maxRequests);
}

export function checkRateLimitKey(key: string, maxRequests: number): boolean {
  const now = Date.now();
  let bucket = RATE_BUCKETS.get(key);

  if (!bucket) {
    bucket = { tokens: maxRequests, lastRefill: now };
    RATE_BUCKETS.set(key, bucket);
  }

  // Refill tokens
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= RATE_INTERVAL_MS) {
    bucket.tokens = maxRequests;
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    return false; // Rate limited
  }

  bucket.tokens--;
  return true;
}

// Cleanup old buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of RATE_BUCKETS) {
    if (now - bucket.lastRefill > RATE_INTERVAL_MS * 2) {
      RATE_BUCKETS.delete(ip);
    }
  }
}, 300_000).unref();

// --- IP extraction (behind proxy/CDN) ---
export function getClientIP(req: import('http').IncomingMessage): string {
  const cfConnecting = req.headers['cf-connecting-ip'];
  if (typeof cfConnecting === 'string') return cfConnecting;

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();

  return req.socket.remoteAddress || 'unknown';
}

// --- CORS headers ---
export function setCorsHeaders(res: import('http').ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Publisher-Token, X-Session-Id');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// --- Security headers ---
export function setSecurityHeaders(res: import('http').ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:;");
}
