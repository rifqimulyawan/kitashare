# KitaShare — Architecture & Development Guide

## Overview

KitaShare is a cross-platform screen sharing application with two sharing modes:

1. **LAN Mode** — Direct HTTP + WebSocket server on local network
2. **Internet Mode** — SSE relay server on Hostinger hPanel for remote access

```
┌─────────────────────────────────────────────────────────────────┐
│                    KitaShare Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐         LAN Mode          ┌──────────────┐    │
│  │  Desktop App │ ──── HTTP + WS :8080 ───→ │ LAN Viewer   │    │
│  │  (Tauri/Rust)│                           │ (Browser)    │    │
│  └──────┬───────┘                           └──────────────┘    │
│         │                                                      │
│         │ Internet Mode                                        │
│         ▼                                                      │
│  ┌──────────────┐  HTTPS POST + HMAC token  ┌──────────────┐   │
│  │  Desktop App │ ────────────────────────→ │  Relay Server│   │
│  │  (Publisher) │  X-Publisher-Token header │  (hPanel/Node)│  │
│  └──────────────┘                          └──────┬───────┘    │
│                                             SSE stream         │
│                                                ▼               │
│                                          ┌──────────────┐     │
│                                          │ Internet     │     │
│                                          │ Viewer       │     │
│                                          │ (Browser)    │     │
│                                          └──────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
rmshare-apps/
├── desktop/                    # Tauri desktop application
│   ├── src/                    # React + TypeScript frontend
│   │   ├── App.tsx             # Main UI with LAN/Internet toggle
│   │   ├── lib/
│   │   │   ├── tauri-bridge.ts # Tauri invoke wrappers
│   │   │   └── store.ts        # Zustand state management
│   │   └── components/         # UI components
│   └── src-tauri/              # Rust backend
│       ├── src/
│       │   ├── lib.rs          # Tauri app builder + command registration
│       │   ├── commands.rs     # Sharing commands (LAN + Internet)
│       │   ├── server.rs       # Local HTTP + WS server (LAN mode)
│       │   └── capture.rs      # Screen capture (scrap crate)
│       ├── resources/
│       │   └── viewer/
│       │       └── index.html  # LAN viewer HTML (embedded)
│       ├── relay-secret.txt    # HMAC secret for publisher auth (gitignored)
│       ├── tauri.conf.json     # Tauri config (bundles relay-secret.txt)
│       └── Cargo.toml          # Rust dependencies
│
├── relay-server/               # SSE relay server (Internet mode)
│   ├── src/
│   │   ├── index.ts            # HTTP server with SSE endpoints
│   │   ├── security.ts         # Auth, rate limiting, sanitization, CORS
│   │   ├── session.ts          # In-memory session store
│   │   └── viewer.html         # Internet viewer HTML (full UI)
│   ├── dist/                   # Compiled JS (generated)
│   ├── app.js                  # Passenger entry point (loads secret.json)
│   ├── .htaccess               # Apache/LiteSpeed config for hPanel
│   ├── deploy_relay.py         # Deploy script for Hostinger (SSH/SCP)
│   ├── package-deploy.json     # Production package.json (no devDeps)
│   ├── secret.json             # HMAC secret (gitignored, server-only)
│   ├── package.json
│   └── tsconfig.json
│
├── .github/workflows/
│   └── build.yml               # CI/CD cross-platform build
│
└── docs/                       # This documentation
    └── ARCHITECTURE.md
```

## LAN Mode (Direct)

### How It Works

1. Desktop app starts HTTP + WebSocket server on `0.0.0.0:8080`
2. Viewer connects via browser to `http://<local-ip>:8080`
3. Frames sent via WebSocket binary messages
4. Chat/raise-hand via WebSocket text messages

### Key Files

- `desktop/src-tauri/src/server.rs` — Axum HTTP + WS server
- `desktop/src-tauri/src/commands.rs` — `start_sharing` command
- `desktop/src-tauri/resources/viewer/index.html` — Embedded viewer

### Data Flow

```
Capture → JPEG encode → broadcast channel → WS binary → Viewer canvas
Chat    → JSON string  → broadcast channel → WS text   → Viewer chat
```

## Internet Mode (SSE Relay)

### How It Works

1. Desktop app generates UUID v4 session ID
2. Desktop app generates HMAC-SHA256 publisher token using shared secret
3. Desktop POST session start with `X-Publisher-Token` header: `POST /api/publish/:sessionId/start`
4. Desktop captures frames, POST each frame with token: `POST /api/publish/:sessionId/frame`
5. Viewer opens `https://kitashare.rmdigital.co.id/view/:sessionId`
6. Viewer enters nickname, connects to SSE: `GET /stream/:sessionId`
7. Relay broadcasts frames/chat to all SSE viewers

### Key Files

- `relay-server/src/index.ts` — HTTP server with SSE endpoints
- `relay-server/src/security.ts` — Rate limiting, sanitization, security headers
- `relay-server/src/session.ts` — In-memory session store with auto-expiry
- `relay-server/src/viewer.html` — Internet viewer with SSE client
- `desktop/src-tauri/src/commands.rs` — `start_internet_sharing` command

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/publish/:sessionId/start` | Publisher token | Publisher starts session |
| `POST` | `/api/publish/:sessionId/frame` | Publisher token | Publisher sends JPEG frame |
| `POST` | `/api/publish/:sessionId/info` | Publisher token | Update session info |
| `POST` | `/api/publish/:sessionId/files` | Publisher token | Update file list |
| `POST` | `/api/publish/:sessionId/stop` | Publisher token | Stop session |
| `GET`  | `/stream/:sessionId` | None | Viewer SSE stream |
| `POST` | `/api/chat/:sessionId` | None | Viewer sends chat |
| `POST` | `/api/raise/:sessionId` | None | Viewer raises hand |
| `GET`  | `/api/info/:sessionId` | None | Get session info |
| `GET`  | `/api/files/:sessionId` | None | Get file list |
| `GET`  | `/health` | None | Health check |
| `GET`  | `/view/:sessionId` | None | Serve viewer HTML |
| `GET`  | `/` | None | Serve viewer HTML (root) |

### Data Flow

```
Desktop Capture → JPEG → HTTP POST + HMAC token → Relay (in-memory) → SSE → Viewer canvas
Viewer Chat     → HTTP POST → Relay → SSE broadcast → All viewers
```

## Security

### Publisher Authentication
- All `/api/publish/*` endpoints require `X-Publisher-Token` header
- Token = HMAC-SHA256(sessionId, sharedSecret) as hex string
- Verified server-side via `crypto.timingSafeEqual` (with length check to prevent crash)
- Secret stored in `secret.json` on server, loaded by `app.js` at startup
- Desktop app reads secret from `KITASHARE_RELAY_SECRET` env var or `relay-secret.txt` file
- Without valid token, publish endpoints return `403 Forbidden`

### Session Access Control
- Session ID = UUID v4 (36 chars, random)
- Only people with the link can join
- Session auto-expires after 4 hours of inactivity
- No persistent storage — all data in RAM

### Server Hardening
- **Publisher auth**: HMAC-SHA256 token required for all publish endpoints
- **Rate limiting**: 120 frames/min (publisher), 60 req/min (viewer), 30 chat/min
- **Input validation**: UUID regex for session IDs, max body sizes
- **Sanitization**: 
  - `sanitizeNickname()` — strips HTML/control chars, max 30 chars
  - `sanitizeChatMessage()` — strips control chars (preserves HTML for rich text), max 2000 chars
  - `sanitizeAvatar()` — validates URL protocol (https/data:image only), max 500 chars
  - `sanitizeBio()` — strips HTML/control chars, max 200 chars
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, CSP
- **CORS**: Configured for cross-origin requests
- **Max sessions**: 100 concurrent (oldest evicted)
- **Max viewers**: 50 per session
- **Max chat history**: 200 messages per session
- **.htaccess**: Directory listing disabled, dotfiles blocked, SSE buffering disabled

### Limitations of Shared Hosting
- SSE connections may timeout after ~120-300s (auto-reconnect handles this)
- No WebSocket support (SSE is used instead)
- No persistent process (Passenger manages lifecycle)
- Frame rate limited by HTTP POST overhead (~10-15 fps typical)

## Development

### Prerequisites

- Node.js 22+
- Rust 1.70+
- npm / pnpm

### Local Development — Desktop App

```bash
cd desktop
npm install
npm run tauri dev
```

### Local Development — Relay Server

```bash
cd relay-server
npm install
npm run dev    # ts-node, hot reload
# Server runs on http://localhost:3000
```

### Build Relay Server

```bash
cd relay-server
npm run build   # TypeScript → dist/
```

### Deploy Relay Server to Hostinger

```bash
cd relay-server
python deploy_relay.py          # Incremental deploy
python deploy_relay.py --full   # Full sync
```

The deploy script:
1. Compiles TypeScript to `dist/`
2. Creates tar.gz of changed files (incremental via SHA256 manifest)
3. SCP upload to `hbuilds/last-source/` on Hostinger
4. Copies files to active version's `nodejs/` directory (including `secret.json`)
5. Restarts Node.js app via `touch app.js` + `tmp/restart.txt` + HTTP health request

> **Note**: The `secret.json` file is preserved on the server and not overwritten by deploys. It must be created manually on first setup.

### Build Desktop App

```bash
cd desktop
npm run tauri build
```

### Environment Variables (Relay Server)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port (Passenger overrides) |
| `KITASHARE_RELAY_SECRET` | random | HMAC secret for publisher tokens |

> If `KITASHARE_RELAY_SECRET` is not set, `app.js` loads it from `secret.json` in the app root.

### Secret Management

The publisher token system requires a shared secret between the relay server and desktop app:

| Location | File | Description |
|----------|------|-------------|
| Relay server | `secret.json` | `{"KITASHARE_RELAY_SECRET":"<hex>"}` in app root |
| Desktop app | `relay-secret.txt` | Plain text hex string next to executable |
| Desktop app (alt) | `KITASHARE_RELAY_SECRET` env var | Fallback if file not found |

Both files are in `.gitignore` and must **never** be committed to git.

To generate a new secret:
```bash
# Generate 64-char hex secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deployment Checklist

### First-time setup on Hostinger hPanel

1. **Create subdomain**: `kitashare.rmdigital.co.id`
2. **DNS A record**: Point to VPS IP (via Cloudflare)
3. **hPanel → Node.js**: Enable Node.js app for subdomain
4. **Set Node.js version**: 18+ (22 recommended)
5. **Set entry point**: `app.js`
6. **Cloudflare**: Disable orange cloud (DNS only) or enable WebSocket
7. **Create `secret.json`**: Upload to `hbuilds/current/nodejs/secret.json` with:
   ```json
   {"KITASHARE_RELAY_SECRET":"<your-generated-hex-secret>"}
   ```
8. **Create `relay-secret.txt`**: Place the same hex secret in `desktop/src-tauri/relay-secret.txt`

### Deploy steps

1. Run `python deploy_relay.py` from `relay-server/`
2. Verify health: `curl https://kitashare.rmdigital.co.id/health`
3. Test viewer: Open `https://kitashare.rmdigital.co.id/view/test-uuid`

### Desktop app configuration

1. Ensure `relay-secret.txt` exists next to the executable (or set `KITASHARE_RELAY_SECRET` env var)
2. Open KitaShare desktop app
3. Select "Internet" mode
4. Enter relay URL: `https://kitashare.rmdigital.co.id`
5. Click Start Sharing
6. Share the generated URL with viewers

## Consistency Notes

- **SessionInfo struct** is defined in 3 places — keep them in sync:
  - `desktop/src-tauri/src/commands.rs` (Rust, source of truth)
  - `desktop/src/lib/tauri-bridge.ts` (TypeScript bridge)
  - `desktop/src/lib/store.ts` (Zustand store)
- **Viewer HTML** exists in 2 places — now feature-parity:
  - `desktop/src-tauri/resources/viewer/index.html` (LAN, WebSocket-based)
  - `relay-server/src/viewer.html` (Internet, SSE-based, full UI with dark mode, language toggle, chat, raise hand, files, accessibility, zoom)
- **Publisher token** must use the same secret on both sides:
  - Relay server: `secret.json` or `KITASHARE_RELAY_SECRET` env var
  - Desktop app: `relay-secret.txt` or `KITASHARE_RELAY_SECRET` env var
- **Security utilities** in `relay-server/src/security.ts` are server-side only
- **Frame format**: JPEG binary (LAN: raw bytes via WS, Internet: base64 via SSE)

## Viewer UI Features (Internet Mode)

The relay viewer (`viewer.html`) includes the following features:

- **Nickname modal** — Enter nickname before joining, with theme/language toggles in modal topbar
- **Dark mode** — Toggle between light/dark themes (persisted in localStorage)
- **Multi-language** — English, Indonesian, Arabic (RTL support, persisted in localStorage)
- **Chat panel** — Real-time chat with SSE broadcast
- **Raise hand** — Visual indicator when viewer raises hand
- **File browser** — View shared files list
- **Accessibility panel** — High contrast, large text, reduced motion
- **Controls bar** — Fullscreen, rotate, raise hand, snapshot, files, accessibility (icon-only, responsive, no overlap)
- **Zoom** — Pinch-to-zoom on touch, mouse wheel zoom on desktop
- **Immersive mode** — Auto-hide UI elements for distraction-free viewing
- **Responsive** — Breakpoints at 768px, 480px, 360px, and landscape mode
