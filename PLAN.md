# YourShare — Comprehensive Build Plan

> Screen sharing reimagined: cross-platform, real-time, accessible, multilingual, and beautiful.

---

## 1. Project Overview

**YourShare** is a cross-platform screen sharing application built with Tauri 2 + React 18 + WebRTC, designed to replace ScreenTask with a faster, more robust, more accessible, and more beautiful alternative.

### Comparison with ScreenTask

| Feature | ScreenTask | YourShare |
|---|---|---|
| Platform | Windows only (.NET 4.5) | Win + macOS + Linux + Android + iOS |
| Streaming | MJPEG screenshots (~500ms) | WebRTC real-time (<100ms) |
| Audio | None | Yes (system + microphone) |
| Encryption | Basic auth only | E2E (DTLS-SRTP) + token auth |
| Client | Browser (Bootstrap 3) | Browser PWA (React + TailwindCSS) |
| App size | 750KB | ~10-15MB |
| Chat/File transfer | None | Yes (WebRTC DataChannel) |
| QR code join | No | Yes |
| Multilang | No | Yes (i18next: en, id, ar + extensible) |
| Dark mode | No | Yes (system + manual toggle) |
| Accessibility | No | Full WCAG 2.1 AA compliance |
| Responsive | Basic (Bootstrap 3) | Full (TailwindCSS breakpoints) |
| Auto-reconnect | No | Yes (exponential backoff) |
| Adaptive quality | No | Yes (WebRTC simulcast) |
| Recording | No | Optional (MediaRecorder API) |
| Remote control | No | Optional (DataChannel input events) |

---

## 2. Architecture

```
YourShare/
├── desktop/                         # Tauri 2 host application
│   ├── src/                         # React UI (host control panel)
│   │   ├── App.tsx                  # Root component + router
│   │   ├── main.tsx                 # React entry point
│   │   ├── index.css                # TailwindCSS + global styles
│   │   ├── i18n/                    # Internationalization
│   │   │   ├── index.ts             # i18next config
│   │   │   ├── locales/
│   │   │   │   ├── en.json          # English
│   │   │   │   ├── id.json          # Bahasa Indonesia
│   │   │   │   └── ar.json          # Arabic (RTL)
│   │   ├── components/              # Modular UI components
│   │   │   ├── ui/                  # Base UI primitives
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Dialog.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Switch.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Tooltip.tsx
│   │   │   │   ├── Badge.tsx
│   │   │   │   ├── Spinner.tsx
│   │   │   │   └── Skeleton.tsx
│   │   │   ├── layout/              # Layout components
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── TopBar.tsx
│   │   │   │   ├── StatusBar.tsx
│   │   │   │   └── ThemeToggle.tsx
│   │   │   ├── host/                # Host-specific components
│   │   │   │   ├── ShareControls.tsx       # Start/stop sharing
│   │   │   │   ├── ScreenPicker.tsx        # Multi-screen selection
│   │   │   │   ├── QualitySettings.tsx     # Resolution/FPS/bitrate
│   │   │   │   ├── AudioToggle.tsx         # System/mic audio
│   │   │   │   ├── ClientList.tsx          # Connected viewers
│   │   │   │   ├── SessionInfo.tsx         # URL + QR code
│   │   │   │   ├── ChatPanel.tsx           # Host-side chat
│   │   │   │   └── SecurityPanel.tsx       # Auth + encryption
│   │   │   └── shared/               # Shared components
│   │   │       ├── QRCode.tsx
│   │   │       ├── LanguageSwitcher.tsx
│   │   │       ├── Notification.tsx
│   │   │       └── AccessibilityPanel.tsx
│   │   ├── hooks/                   # Custom React hooks
│   │   │   ├── useScreenShare.ts    # WebRTC host logic
│   │   │   ├── useAudioCapture.ts   # Audio capture
│   │   │   ├── useSignaling.ts      # WebSocket signaling
│   │   │   ├── useTheme.ts          # Dark/light mode
│   │   │   ├── useAccessibility.ts  # A11y settings
│   │   │   └── useConnectionStatus.ts
│   │   ├── lib/                     # Core libraries
│   │   │   ├── webrtc-host.ts       # WebRTC host wrapper
│   │   │   ├── signaling-client.ts  # WebSocket client
│   │   │   ├── tauri-bridge.ts      # Tauri IPC bridge
│   │   │   ├── store.ts             # Zustand state management
│   │   │   └── utils.ts             # Helpers (cn, format, etc.)
│   │   └── pages/                   # Page-level views
│   │       ├── HomePage.tsx         # Dashboard / start sharing
│   │       ├── SettingsPage.tsx     # App settings
│   │       └── AboutPage.tsx        # About + version info
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── lib.rs               # Tauri entry + mobile entry point
│   │   │   ├── main.rs              # Windows subsystem config
│   │   │   ├── capture.rs           # Screen capture (platform-specific)
│   │   │   ├── audio.rs             # Audio capture (cpal)
│   │   │   ├── signaling.rs         # Embedded WebSocket signaling server
│   │   │   ├── webrtc.rs            # WebRTC track + peer connection
│   │   │   ├── commands.rs          # Tauri IPC commands
│   │   │   └── platform/
│   │   │       ├── mod.rs
│   │   │       ├── windows.rs       # DXGI Desktop Duplication
│   │   │       ├── macos.rs         # CGDisplay / ScreenCaptureKit
│   │   │       ├── linux.rs         # X11 / PipeWire
│   │   │       └── android.rs       # MediaProjection (Kotlin plugin)
│   │   ├── Cargo.toml               # Rust dependencies
│   │   ├── tauri.conf.json          # Tauri config (all platforms)
│   │   ├── capabilities/
│   │   │   └── default.json         # Permissions
│   │   ├── gen/
│   │   │   ├── android/             # Tauri 2 Android target
│   │   │   └── apple/               # Tauri 2 iOS target
│   │   └── icons/                   # App icons (all platforms)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── viewer/                          # React PWA (browser client)
│   ├── src/
│   │   ├── App.tsx                  # Viewer root
│   │   ├── main.tsx
│   │   ├── index.css
│   │   ├── i18n/                    # Same i18n setup as desktop
│   │   ├── components/
│   │   │   ├── ui/                  # Shared UI primitives (same as host)
│   │   │   ├── viewer/              # Viewer-specific
│   │   │   │   ├── VideoPlayer.tsx       # WebRTC receiver + fullscreen
│   │   │   │   ├── ViewerControls.tsx    # Play/pause/quality/snapshot
│   │   │   │   ├── ChatPanel.tsx         # Viewer-side chat
│   │   │   │   ├── FileTransfer.tsx      # Send/receive files
│   │   │   │   ├── ConnectionStatus.tsx  # Latency/quality indicator
│   │   │   │   └── JoinScreen.tsx        # Enter code/URL to join
│   │   │   └── shared/              # Same shared components
│   │   ├── hooks/
│   │   │   ├── useWebRTCReceiver.ts # WebRTC client logic
│   │   │   ├── useSignaling.ts      # WebSocket signaling
│   │   │   ├── useTheme.ts
│   │   │   └── useAccessibility.ts
│   │   ├── lib/
│   │   │   ├── webrtc-viewer.ts     # WebRTC receiver wrapper
│   │   │   ├── signaling-client.ts
│   │   │   ├── store.ts
│   │   │   └── utils.ts
│   │   └── pages/
│   │       ├── JoinPage.tsx         # Enter session code/URL
│   │       └── ViewerPage.tsx       # Stream viewer + chat
│   ├── public/
│   │   ├── manifest.json            # PWA manifest
│   │   └── sw.js                    # Service Worker (offline shell)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── signaling/                       # Standalone signaling server (optional)
│   ├── server.js                    # Node.js WebSocket signaling
│   ├── package.json
│   └── README.md                    # Deploy instructions (LAN/cloud)
│
├── shared/                          # Shared TypeScript packages
│   ├── types/                       # Shared types (SDP, ICE, messages)
│   │   └── index.ts
│   └── i18n/                        # Shared i18n locale files
│       ├── en.json
│       ├── id.json
│       └── ar.json
│
├── .github/
│   └── workflows/
│       ├── build-desktop.yml        # CI: build Tauri for Win/Mac/Linux
│       └── deploy-viewer.yml        # CI: deploy PWA to Netlify
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── ACCESSIBILITY.md
│   ├── API.md                       # Tauri IPC commands reference
│   └── DEPLOYMENT.md
│
├── README.md
└── LICENSE
```

---

## 3. Technology Stack

### Desktop Host App

| Layer | Technology | Why |
|---|---|---|
| Desktop Shell | **Tauri 2** (Rust) | Cross-platform (Win/Mac/Linux/Android/iOS), ~10MB, memory-safe |
| Frontend | **React 18** + TypeScript | Component-based, mature ecosystem |
| Build Tool | **Vite 5** | Fast HMR, optimized builds |
| Styling | **TailwindCSS 3.4** + tailwindcss-animate | Utility-first, dark mode, responsive |
| UI Components | **Radix UI** primitives | Accessible, unstyled, composable |
| Icons | **Lucide React** | Consistent, lightweight, tree-shakeable |
| State | **Zustand** | Simple, fast, no boilerplate |
| i18n | **i18next** + react-i18next | Multilang with lazy loading |
| QR Code | **qrcode.react** | QR generation for join URL |

### Rust Backend (src-tauri)

| Crate | Purpose |
|---|---|
| `tauri` 2 | App shell + IPC |
| `scrap` 0.5 | Screen capture (Win DXGI, macOS CGDisplay, Linux X11) |
| `cpal` 0.15 | Audio capture (cross-platform) |
| `webrtc` 0.11 (webrtc-rs) | WebRTC peer connection + track |
| `tokio` 1 | Async runtime |
| `tokio-tungstenite` 0.23 | WebSocket signaling server |
| `serde` + `serde_json` | Serialization |
| `pipewire` 0.8 (Linux Wayland) | PipeWire screen capture |

### Viewer PWA

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | TailwindCSS 3.4 |
| UI | Radix UI + Lucide |
| State | Zustand |
| i18n | i18next |
| PWA | vite-plugin-pwa (Service Worker + manifest) |

### Signaling Server (optional standalone)

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| WebSocket | `ws` package |
| Protocol | JSON messages (offer/answer/candidate/join/leave) |

---

## 4. Design System & Styling

### 4.1 Design Principles (inspired by rmflask)

- **Clean & Modern**: Card-based layouts with subtle shadows and rounded corners
- **Dark Mode First**: System preference detection + manual toggle (from rmflask `dark-mode.js` pattern)
- **Skeleton Loading**: Shimmer placeholders during async operations (from rmflask `skeleton.css` pattern)
- **Responsive Grid**: Mobile-first breakpoints (3-col mobile → 4-col tablet → 6-col desktop, from rmflask `homescreen-grid`)
- **Micro-interactions**: Ripple effects, hover lifts, tap feedback (from rmflask card patterns)
- **Smooth Transitions**: 0.15-0.3s ease for all interactive elements
- **Brand Font**: Outfit / system-ui fallback (from rmflask `--brand-font`)

### 4.2 Color System (TailwindCSS + CSS variables)

```css
:root {
  /* Brand */
  --primary: 221 83% 53%;          /* blue-600 */
  --primary-foreground: 210 40% 98%;

  /* Semantic */
  --success: 142 71% 45%;          /* green-500 */
  --warning: 38 92% 50%;           /* amber-500 */
  --destructive: 0 84% 60%;        /* red-500 */

  /* Surface */
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --muted: 210 40% 96%;
  --border: 214 32% 91%;

  /* Radius */
  --radius: 0.75rem;
}

.dark {
  --background: 222 47% 11%;
  --foreground: 210 40% 98%;
  --card: 222 47% 14%;
  --muted: 217 33% 17%;
  --border: 217 33% 20%;
}
```

### 4.3 Component Patterns (from rmflask → React)

| rmflask Pattern | YourShare React Equivalent |
|---|---|
| `skeleton.css` shimmer | `<Skeleton />` component with shimmer animation |
| `dark-mode.js` toggle | `useTheme()` hook + `<ThemeToggle />` component |
| `lang_switcher.html` | `<LanguageSwitcher />` with i18next (no Google Translate dependency) |
| `menu-card` hover lift | Card component with `hover:-translate-y-1` + shadow transition |
| `ripple` effect | Ripple hook on Button component |
| `notification_banner.html` | `<Notification />` toast system |
| `homescreen-grid` responsive | CSS Grid with Tailwind `grid-cols-3 sm:grid-cols-4 lg:grid-cols-6` |
| `scrollbar-hide` | Tailwind utility class |
| `cta-webview` hover | CTA component with hover transform |

### 4.4 TailwindCSS Config

```js
// tailwind.config.js
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // CSS variable based (from rmapps pattern)
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        // ... same pattern as rmapps/frontend/tailwind.config.js
      },
      fontFamily: {
        brand: ["Outfit", "system-ui", "sans-serif"],
      },
      animation: {
        "shimmer": "shimmer 1.5s infinite",
        "ripple": "ripple 0.6s linear",
        "float": "float 3s ease-in-out infinite",
      },
      keyframes: {
        shimmer: { "0%": { backgroundPosition: "200% 0" }, "100%": { backgroundPosition: "-200% 0" } },
        ripple: { to: { transform: "scale(4)", opacity: "0" } },
        float: { "0%, 100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-20px)" } },
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
```

---

## 5. Accessibility (WCAG 2.1 AA)

### 5.1 Visual Accessibility

- **High contrast mode**: Toggle for increased contrast ratios (4.5:1 minimum)
- **Large text mode**: Scale text up to 150% without layout breakage
- **Color blind support**: Never rely on color alone; always pair with icons/text
- **Focus indicators**: Visible focus rings (2px outline, 4px offset) on all interactive elements
- **Reduced motion**: Respect `prefers-reduced-motion` — disable animations/ripples

### 5.2 Motor Accessibility

- **Keyboard navigation**: Full keyboard support (Tab, Shift+Tab, Enter, Space, Escape)
- **Skip to content**: Skip link at top of page for screen reader users
- **Large click targets**: Minimum 44x44px touch targets (WCAG 2.5.5)
- **No time limits**: No auto-dismissing dialogs or timeouts without warning + extend option
- **Drag alternatives**: Keyboard-accessible alternatives for all drag operations

### 5.3 Cognitive Accessibility

- **Clear labels**: Every input has associated `<label>` element
- **Error identification**: Errors described in text, not just color
- **Consistent navigation**: Same nav structure across all pages
- **Predictable**: No unexpected context changes or popups
- **Help text**: Contextual help icons with tooltips for complex features

### 5.4 Auditory Accessibility

- **Live captions**: Real-time captions for audio stream (via Web Speech API or WebRTC data)
- **Visual notifications**: Sound + visual indicator for chat messages, join/leave events
- **Volume control**: Independent volume slider for stream audio
- **Transcript**: Optional session transcript saved as text file

### 5.5 Screen Reader Support

- **ARIA labels**: All interactive elements have `aria-label` or `aria-labelledby`
- **ARIA live regions**: Chat messages, connection status, errors announced via `aria-live="polite"`
- **Semantic HTML**: Use `<nav>`, `<main>`, `<aside>`, `<button>`, `<dialog>` correctly
- **Role attributes**: Appropriate `role` for custom widgets (e.g., `role="slider"` for quality)
- **Alt text**: All icons have `alt` or `aria-label`; decorative icons have `aria-hidden="true"`

### 5.6 Accessibility Settings Panel

```
Accessibility Settings
├── [Toggle] High Contrast Mode
├── [Toggle] Large Text (125% / 150%)
├── [Toggle] Reduced Motion
├── [Toggle] Live Captions
├── [Toggle] Visual Sound Indicators
├── [Toggle] Screen Reader Hints (extra ARIA)
├── [Slider] Focus Ring Thickness (2px - 6px)
└── [Select] Caption Language (follows i18n)
```

---

## 6. Internationalization (i18n)

### 6.1 Supported Languages

| Code | Language | Direction | Status |
|---|---|---|---|
| `en` | English | LTR | Default |
| `id` | Bahasa Indonesia | LTR | Full |
| `ar` | العربية (Arabic) | RTL | Full |

### 6.2 Implementation

- **i18next** with `react-i18next` bindings
- **Lazy loading**: Locale files loaded on demand (code-split per language)
- **RTL support**: Automatic `dir="rtl"` on `<html>` when Arabic selected
- **Fallback**: `en` as fallback language
- **Namespace splitting**: `common`, `host`, `viewer`, `settings`, `accessibility`
- **Interpolation**: Support for variables (`{{count}} clients connected`)
- **Pluralization**: i18next built-in plural rules
- **Persistence**: Language preference saved to `localStorage`

### 6.3 Translation Keys Structure

```json
{
  "common": {
    "appName": "YourShare",
    "start": "Start",
    "stop": "Stop",
    "settings": "Settings",
    "close": "Close",
    "cancel": "Cancel",
    "confirm": "Confirm"
  },
  "host": {
    "startSharing": "Start Sharing",
    "stopSharing": "Stop Sharing",
    "selectScreen": "Select Screen to Share",
    "clientsConnected": "{{count}} viewer(s) connected",
    "sessionCode": "Session Code",
    "qrCode": "Scan QR to Join"
  },
  "viewer": {
    "joinSession": "Join Session",
    "enterCode": "Enter Session Code",
    "waitingForHost": "Waiting for host to start...",
    "streamEnded": "Stream has ended",
    "chatPlaceholder": "Type a message..."
  },
  "accessibility": {
    "highContrast": "High Contrast Mode",
    "largeText": "Large Text",
    "reducedMotion": "Reduced Motion",
    "captions": "Live Captions",
    "screenReaderHints": "Screen Reader Hints"
  }
}
```

---

## 7. Performance Optimizations

### 7.1 Streaming Performance

- **WebRTC over MJPEG**: Sub-100ms latency vs 500ms+ MJPEG
- **Simulcast**: Send 3 quality layers (1080p, 720p, 360p) — viewer auto-selects based on bandwidth
- **Hardware encoding**: Use H.264 hardware encoder when available (NVENC, VideoToolbox, VAAPI)
- **Adaptive bitrate**: WebRTC congestion control auto-adjusts bitrate
- **VP9/AV1 fallback**: Better compression than VP8 when supported
- **Frame rate control**: Configurable 15/24/30/60 FPS
- **Region capture**: Share specific window or screen region (not full screen) for lower bandwidth

### 7.2 Frontend Performance

- **Code splitting**: Route-level lazy loading (React.lazy + Suspense)
- **Tree shaking**: Only import used Radix UI components + Lucide icons
- **Bundle optimization**: Vite Rollup with manual chunks for vendor splitting
- **Image optimization**: SVG icons (Lucide), no raster images except app icon
- **CSS optimization**: TailwindCSS JIT (only generates used classes)
- **PWA caching**: Service Worker caches app shell for instant viewer load
- **Preconnect**: `<link rel="preconnect">` to signaling server
- **Debounced inputs**: 150ms debounce on search/settings inputs

### 7.3 Rust Backend Performance

- **Zero-copy capture**: `scrap` crate captures directly from GPU framebuffer
- **Async I/O**: `tokio` for non-blocking WebSocket + WebRTC
- **LTO + strip**: Release profile with `lto=true`, `opt-level="s"`, `strip=true` (from rmapps Cargo.toml)
- **Single binary**: No runtime dependencies (no Node.js, no Python needed)
- **Memory efficient**: Rust ownership model prevents memory leaks

### 7.4 Network Performance

- **STUN/TURN**: Built-in STUN server; optional TURN relay for restrictive networks
- **ICE candidates**: Host + server-reflexive + relay candidates for maximum connectivity
- **WebSocket compression**: Per-message deflate for signaling
- **DataChannel binary**: File transfer uses binary DataChannel (no base64 overhead)
- **Chunked file transfer**: Files sent in 16KB chunks with progress tracking

---

## 8. Security

### 8.1 Authentication

- **Session token**: Random 6-character code (e.g., `ABC123`) for easy sharing
- **Optional password**: Host can set password for private sessions
- **JWT tokens**: For signaling server authentication (optional, for cloud deployment)
- **No persistent credentials**: Sessions are ephemeral, no stored passwords

### 8.2 Encryption

- **WebRTC DTLS-SRTP**: All video/audio streams are E2E encrypted by default
- **WSS (WebSocket Secure)**: Signaling channel encrypted in transit
- **DataChannel encryption**: Chat and file transfer encrypted via SCTP over DTLS

### 8.3 Privacy

- **No recording by default**: Stream is live-only unless host explicitly enables recording
- **No cloud storage**: Everything runs on host device; no third-party servers needed for LAN
- **No telemetry**: No analytics or tracking built-in
- **Local network first**: Works completely offline on LAN

---

## 9. Cross-Platform Strategy

### 9.1 Build Targets

| Platform | Build Output | CI/CD |
|---|---|---|
| Windows | `.exe` (NSIS) + `.msi` (WiX) | GitHub Actions (windows-latest) |
| macOS | `.dmg` (Universal: Apple Silicon + Intel) | GitHub Actions (macos-latest) |
| Linux | `.AppImage` + `.deb` + `.rpm` | GitHub Actions (ubuntu-latest) |
| Android | `.apk` + `.aab` | GitHub Actions (ubuntu-latest + Android SDK) |
| iOS | `.ipa` | GitHub Actions (macos-latest + Xcode) |
| Web (viewer) | Static PWA | Netlify deploy |

### 9.2 Platform-Specific Screen Capture

| Platform | API | Crate/Plugin |
|---|---|---|
| Windows | DXGI Desktop Duplication | `scrap` (built-in) |
| macOS | CGWindowList + ScreenCaptureKit (12.3+) | `scrap` + `screencapturekit` crate |
| Linux X11 | XGetImage + XDamage | `scrap` (built-in) |
| Linux Wayland | PipeWire + xdg-desktop-portal | `pipewire` crate + portal D-Bus |
| Android | MediaProjection API | Tauri 2 Kotlin plugin |
| iOS | ReplayKit Broadcast Extension | Tauri 2 Swift plugin |

### 9.3 Platform Permissions

| Platform | Permission | Handling |
|---|---|---|
| macOS | Screen Recording | Prompt on first launch + guide to System Settings |
| Linux Wayland | Portal screencast | xdg-desktop-portal dialog |
| Android | MediaProjection + Foreground Service | Runtime permission request |
| iOS | Screen Broadcast | ReplayKit extension setup |

---

## 10. Build Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Working Tauri 2 app with React UI, no streaming yet.

- [ ] Initialize project structure in `rmshare-apps/`
- [ ] Setup Tauri 2 desktop project (copy pattern from `rmapps/desktop`)
- [ ] Setup React + Vite + TypeScript + TailwindCSS
- [ ] Setup i18next with en, id, ar locales
- [ ] Build base UI components (Button, Card, Dialog, Input, Switch, Badge, Spinner, Skeleton)
- [ ] Build layout (Sidebar, TopBar, ThemeToggle, LanguageSwitcher)
- [ ] Implement dark mode (useTheme hook, localStorage persistence)
- [ ] Implement accessibility settings panel
- [ ] Create HomePage with share controls UI (non-functional)
- [ ] Create SettingsPage

### Phase 2: Screen Capture + WebRTC (Week 3-4)

**Goal**: Host can capture screen and stream via WebRTC.

- [ ] Add Rust dependencies (`scrap`, `cpal`, `webrtc`, `tokio`, `tokio-tungstenite`)
- [ ] Implement `capture.rs` — screen capture for Windows (DXGI)
- [ ] Implement `capture.rs` — screen capture for macOS (CGDisplay)
- [ ] Implement `capture.rs` — screen capture for Linux (X11)
- [ ] Implement `audio.rs` — audio capture with `cpal`
- [ ] Implement `signaling.rs` — embedded WebSocket server
- [ ] Implement `webrtc.rs` — WebRTC peer connection + track
- [ ] Implement `commands.rs` — Tauri IPC commands (start_share, stop_share, get_screens)
- [ ] Wire React `useScreenShare` hook to Tauri commands
- [ ] Build ScreenPicker component (multi-monitor selection)
- [ ] Build QualitySettings component (resolution, FPS, bitrate)
- [ ] Build AudioToggle component

### Phase 3: Viewer PWA (Week 5-6)

**Goal**: Browser-based viewer can join and watch stream.

- [ ] Initialize viewer PWA project (React + Vite + TailwindCSS)
- [ ] Implement WebRTC receiver logic (`webrtc-viewer.ts`)
- [ ] Implement signaling client (WebSocket)
- [ ] Build JoinPage (enter session code/URL)
- [ ] Build ViewerPage with VideoPlayer
- [ ] Build ViewerControls (play/pause, quality selector, snapshot, fullscreen)
- [ ] Build ConnectionStatus (latency, bitrate, quality indicator)
- [ ] Add PWA manifest + Service Worker (vite-plugin-pwa)
- [ ] Copy i18n setup from desktop
- [ ] Copy accessibility settings from desktop
- [ ] Responsive layout (mobile, tablet, desktop)

### Phase 4: Interactive Features (Week 7-8)

**Goal**: Chat, file transfer, QR join, client management.

- [ ] Implement WebRTC DataChannel for chat
- [ ] Build ChatPanel (host + viewer side)
- [ ] Implement file transfer via DataChannel (chunked binary)
- [ ] Build FileTransfer component
- [ ] Build QRCode component (qrcode.react) on host
- [ ] Build ClientList on host (connected viewers, kick, mute)
- [ ] Build SessionInfo (URL, QR, session code)
- [ ] Implement auto-reconnect (exponential backoff)
- [ ] Add notification system (toast for join/leave/chat)

### Phase 5: Accessibility + Polish (Week 9-10)

**Goal**: Full WCAG 2.1 AA compliance, RTL support, animations.

- [ ] Audit all components for ARIA labels + roles
- [ ] Implement keyboard navigation (focus trap in dialogs, tab order)
- [ ] Implement live captions (Web Speech API integration)
- [ ] Implement high contrast mode
- [ ] Implement large text mode (125% / 150%)
- [ ] Implement reduced motion (respect `prefers-reduced-motion`)
- [ ] Test RTL layout with Arabic locale
- [ ] Add skip-to-content link
- [ ] Add ARIA live regions for chat + connection status
- [ ] Add focus ring thickness slider
- [ ] Add visual sound indicators (flash on audio event)
- [ ] Cross-check accessibility with axe-core + Lighthouse

### Phase 6: Cross-Platform + Mobile (Week 11-12)

**Goal**: Build for all platforms, add Android support.

- [ ] Test Windows build (NSIS + MSI)
- [ ] Test macOS build (Universal DMG)
- [ ] Test Linux build (AppImage + deb)
- [ ] Add Wayland/PipeWire support for Linux
- [ ] Setup Tauri 2 Android target (`tauri android init`)
- [ ] Implement Android MediaProjection plugin (Kotlin)
- [ ] Test Android build (APK)
- [ ] Setup GitHub Actions CI/CD for all platforms
- [ ] Deploy viewer PWA to Netlify
- [ ] Write documentation (ARCHITECTURE, ACCESSIBILITY, DEPLOYMENT)

### Phase 7: Advanced Features (Future)

- [ ] Session recording (MediaRecorder API → WebM file)
- [ ] Remote control (DataChannel input events)
- [ ] Multi-host support (multiple senders in one session)
- [ ] Whiteboard overlay (shared drawing on stream)
- [ ] Session scheduling (calendar integration)
- [ ] Bandwidth analytics dashboard
- [ ] OBS integration (virtual camera output)
- [ ] iOS support (ReplayKit Broadcast Extension)

---

## 11. Key Technical Decisions

### Why Tauri 2 over Electron?

| Criteria | Tauri 2 | Electron |
|---|---|---|
| App size | ~10MB | ~150MB |
| RAM usage | ~50MB | ~200MB |
| Mobile support | Android + iOS | None |
| Security | Rust memory-safe | Node.js runtime |
| Startup time | <1s | ~3s |
| Reuse rmapps pattern | Yes (already have working setup) | No |

### Why WebRTC over MJPEG?

| Criteria | WebRTC | MJPEG |
|---|---|---|
| Latency | <100ms | 500ms+ |
| Audio | Yes | No |
| Adaptive bitrate | Yes | No |
| Encryption | E2E (DTLS-SRTP) | None |
| CPU usage | Hardware encoded | JPEG encode per frame |
| Browser support | Native (no plugin) | Native (img tag) |

### Why i18next over Google Translate?

| Criteria | i18next | Google Translate |
|---|---|---|
| Offline support | Yes | No (needs internet) |
| Translation quality | Native quality | Machine translation |
| RTL support | Built-in | Partial |
| Performance | Local JSON (instant) | External script + reload |
| Maintainability | Versioned JSON files | External dependency |

---

## 12. File Structure Summary

```
rmshare-apps/
├── desktop/          # Tauri 2 host (Rust + React)
├── viewer/           # React PWA (browser client)
├── signaling/        # Optional Node.js signaling server
├── shared/           # Shared TypeScript types + i18n
├── .github/          # CI/CD workflows
├── docs/             # Documentation
├── PLAN.md           # This file
├── README.md
└── LICENSE
```

---

## 13. Success Metrics

| Metric | ScreenTask | YourShare Target |
|---|---|---|
| Latency | ~500ms | <100ms |
| Platforms | 1 (Windows) | 5+ (Win/Mac/Linux/Android/iOS) |
| App size | 750KB | <15MB |
| Languages | 1 (English UI) | 3+ (en/id/ar, extensible) |
| Accessibility | None | WCAG 2.1 AA |
| Client install | Browser only | Browser only (PWA) |
| Audio | No | Yes |
| Chat | No | Yes |
| File transfer | No | Yes |
| Encryption | Basic auth | E2E (DTLS-SRTP) |
| Auto-reconnect | No | Yes |
| Dark mode | No | Yes |
| Responsive | Basic | Full (mobile/tablet/desktop) |
