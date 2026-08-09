# KitaShare

> Cross-platform screen sharing with real-time streaming, chat, file sharing, and accessibility support.

[![Build](https://github.com/rifqimulyawan/kitashare/actions/workflows/build.yml/badge.svg)](https://github.com/rifqimulyawan/kitashare/actions/workflows/build.yml)

## Features

- **Screen Sharing** — Stream your screen via LAN (WebSocket) or Internet (SSE relay)
- **Real-time Chat** — Built-in chat with memes, quotes, and raise-hand feature
- **File Sharing** — Share files with viewers (download via browser)
- **QR Code Join** — Viewers scan QR code to join instantly
- **Multilingual** — English, Indonesian, Arabic
- **Dark Mode** — System-aware theme with manual toggle
- **Accessibility** — High contrast, large text, visual notifications
- **Responsive Viewer** — Works on desktop, tablet, and mobile browsers
- **Randomized Memes & Quotes** — Content is shuffled on every load

## Architecture

```
kitashare/
├── desktop/          # Tauri 2 + React 18 desktop app (host)
├── relay-server/     # Node.js SSE relay server for internet sharing
└── .github/          # CI/CD workflows
```

### Desktop App (Host)

- **Tauri 2** with Rust backend
- **React 18** + TypeScript + TailwindCSS frontend
- **Axum** WebSocket server for LAN sharing
- **Screen capture** via `scrap` crate (MJPEG frames)
- **HMAC-SHA256** publisher token authentication

### Relay Server (Internet Sharing)

- **Node.js** HTTP server with SSE (Server-Sent Events)
- **In-memory** session management (no database)
- **File content storage** in memory (up to 50MB per file)
- **Chat history** with polling endpoint
- Serves `viewer.html` for online viewers

### Viewer (Browser)

- No installation needed — viewers join via browser
- **LAN mode**: connects via WebSocket to host's Axum server
- **Online mode**: connects via SSE to relay server
- Works on any modern browser (Chrome, Firefox, Safari, Edge)

## Installation

### Download

Download the latest release from the [Releases page](https://github.com/rifqimulyawan/kitashare/releases).

- **Windows**: `.msi` or `.exe` installer
- **macOS**: `.dmg` (Apple Silicon & Intel)
- **Linux**: `.AppImage` or `.deb`

### Build from Source

#### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Platform-specific Tauri [prerequisites](https://v2.tauri.app/start/prerequisites/)

#### Steps

```bash
# Clone the repository
git clone https://github.com/rifqimulyawan/kitashare.git
cd kitashare

# Install frontend dependencies
cd desktop
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Usage

### Host (Desktop App)

1. Launch KitaShare
2. Enter your nickname, avatar, and bio
3. Choose sharing mode:
   - **LAN** — Viewers connect via local network IP
   - **Online** — Viewers connect via relay server URL
4. Click **Start Sharing**
5. Share the QR code or URL with viewers
6. Use chat, memes, quotes, and file sharing during the session

### Viewer (Browser)

1. Open the shared URL (or scan QR code)
2. Enter your nickname
3. View the screen stream in real-time
4. Chat, raise hand, send memes/quotes, and download shared files

## Configuration

### Relay Server

The relay server is deployed separately. Configure the relay URL and secret in the desktop app's `relay-secret.txt`:

```
RELAY_URL=https://your-relay-server.com
RELAY_SECRET=your-hex-secret-key
```

> **Note**: `relay-secret.txt` is gitignored and never committed.

### Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Relay server port (default: 3000) |
| `RELAY_SECRET` | HMAC secret for publisher token verification |

## Tech Stack

| Component | Technology |
|---|---|
| Desktop Framework | Tauri 2 |
| Frontend | React 18, TypeScript, TailwindCSS |
| Backend | Rust, Axum |
| Relay Server | Node.js, TypeScript |
| Screen Capture | scrap crate (Rust) |
| Streaming | MJPEG over WebSocket (LAN) / SSE (Online) |
| Auth | HMAC-SHA256 publisher tokens |
| Icons | Lucide React |
| i18n | i18next |

## License

This project is proprietary. All rights reserved.

## Links

- [Releases](https://github.com/rifqimulyawan/kitashare/releases)
- [Issues](https://github.com/rifqimulyawan/kitashare/issues)
