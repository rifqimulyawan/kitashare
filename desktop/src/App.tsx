import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Monitor,
  MonitorOff,
  Copy,
  Check,
  Users,
  Settings,
  Accessibility,
  Wifi,
  X,
  Globe,
  Cpu,
  Gauge,
  Maximize2,
  Hand,
  MessageSquare,
  Send,
  User,
  Camera,
  FolderOpen,
  FileText,
  FilePlus2,
  Trash2,
  Download,
  Upload,
  Smile,
  Quote,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "./components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/Card";
import { Badge } from "./components/ui/Badge";
import { Switch } from "./components/ui/Switch";
import { Spinner } from "./components/ui/Spinner";
import { ThemeToggle } from "./components/shared/ThemeToggle";
import { LanguageSwitcher } from "./components/shared/LanguageSwitcher";
import { useShareStore, useAccessibilityStore, useProfileStore } from "./lib/store";
import {
  startSharing,
  stopSharing,
  getSessionInfo,
  getAvailableDisplays,
  onRaiseHand,
  onChatMessage,
  shareFiles,
  clearFiles,
  removeFile,
  openFileDialog,
  startInternetSharing,
  updateInternetProfile,
  updateHostProfile,
  sendChat,
  type SessionInfo,
  type DisplayInfo,
  type SharedFileInfo,
} from "./lib/tauri-bridge";

export default function App() {
  const { t } = useTranslation();
  const { isSharing, sessionInfo, error, setSharing, setError, updateClients } =
    useShareStore();
  const a11y = useAccessibilityStore();
  const profile = useProfileStore();

  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplay, setSelectedDisplay] = useState(0);
  const [quality, setQuality] = useState(75);
  const [fps, setFps] = useState(30);
  const [port] = useState(8080);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showA11y, setShowA11y] = useState(false);
  const [showQrFullscreen, setShowQrFullscreen] = useState(false);
  const [raiseHandNotifications, setRaiseHandNotifications] = useState<{user: string; timestamp: number}[]>([]);
  const [showRaiseHand, setShowRaiseHand] = useState(false);
  const [chatMessages, setChatMessages] = useState<{user: string; text: string; timestamp: number; subtype: string; isSelf: boolean}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [profileName, setProfileName] = useState(profile.name);
  const [profileBio, setProfileBio] = useState(profile.bio);
  const [showFiles, setShowFiles] = useState(false);
  const [sharedFiles, setSharedFiles] = useState<SharedFileInfo[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [showPicker, setShowPicker] = useState<"meme" | "quote" | null>(null);
  const [pickerItems, setPickerItems] = useState<{url?: string; text?: string; author?: string}[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [shareMode, setShareMode] = useState<"lan" | "internet">("lan");
  const [relayUrl, setRelayUrl] = useState(localStorage.getItem("kitashare-relay-url") || "https://kitashare.rmdigital.co.id");
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    getAvailableDisplays()
      .then(setDisplays)
      .catch(() => setDisplays([{ index: 0, width: 1920, height: 1080 }]));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;
    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (!active) return;
        const e = event.payload;
        if (e.type === "enter" || e.type === "over") {
          if (showFiles) setIsDragging(true);
        } else if (e.type === "drop") {
          setIsDragging(false);
          if (showFiles && e.paths.length > 0) {
            shareFiles(e.paths)
              .then((added) => setSharedFiles((prev) => [...prev, ...added]))
              .catch((err) => console.error("Failed to add dropped files:", err));
          }
        } else if (e.type === "leave") {
          setIsDragging(false);
        }
      });
    })();
    return () => { active = false; if (unlisten) unlisten(); };
  }, [showFiles]);

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    setError(null);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const minDelay = new Promise((r) => setTimeout(r, 3000));
      let info: SessionInfo;
      if (shareMode === "internet") {
        info = await startInternetSharing(
          relayUrl,
          selectedDisplay, quality, fps,
          profile.name || undefined,
          profile.avatar || undefined,
          profile.bio || undefined,
        );
      } else {
        info = await startSharing(
          selectedDisplay, quality, fps, port,
          profile.name || undefined,
          profile.avatar || undefined,
          profile.bio || undefined,
        );
      }
      await minDelay;
      setSharing(info);
    } catch (e: any) {
      await new Promise((r) => setTimeout(r, 3000));
      setError(e?.message || String(e));
    } finally {
      setIsStarting(false);
    }
  }, [selectedDisplay, quality, fps, port, setSharing, setError, profile, shareMode, relayUrl]);

  // Push profile updates when sharing (LAN or internet)
  useEffect(() => {
    if (!isSharing) return;
    if (sessionInfo?.internetUrl) {
      updateInternetProfile(
        profile.name || undefined,
        profile.avatar || undefined,
        profile.bio || undefined,
      ).catch(() => {});
    } else {
      updateHostProfile(
        profile.name || undefined,
        profile.avatar || undefined,
        profile.bio || undefined,
      ).catch(() => {});
    }
  }, [isSharing, sessionInfo?.internetUrl, profile.name, profile.avatar, profile.bio]);

  const handleStop = useCallback(async () => {
    try {
      await stopSharing();
      setSharing(null);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [setSharing, setError]);

  const handleCopy = useCallback(() => {
    if (!sessionInfo) return;
    const url = sessionInfo.internetUrl || sessionInfo.url;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sessionInfo]);

  // Listen for raise hand events via polling /api/info
  useEffect(() => {
    if (!isSharing) return;
    const interval = setInterval(async () => {
      try {
        const info = await getSessionInfo();
        updateClients(info.clients);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [isSharing, updateClients]);

  // Listen for raise hand events from viewers
  useEffect(() => {
    if (!isSharing) return;
    let unlisten: (() => void) | undefined;
    onRaiseHand((payload) => {
      setRaiseHandNotifications([{ user: payload.user, timestamp: payload.timestamp }]);
      setChatMessages((prev) => [...prev, { user: payload.user, text: "✋ " + t("host.raisedHandMsg", { user: payload.user }), timestamp: payload.timestamp, subtype: "raise_hand", isSelf: false }]);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [isSharing]);

  // Listen for chat messages from viewers
  useEffect(() => {
    if (!isSharing) return;
    let unlisten: (() => void) | undefined;
    onChatMessage((payload) => {
      setChatMessages((prev) => [...prev, { ...payload, isSelf: false }]);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, [isSharing]);

  const exportChatCsv = useCallback(() => {
    const rows = [["Timestamp", "User", "Message", "Type"]];
    for (const msg of chatMessages) {
      const time = new Date(msg.timestamp * 1000).toLocaleString();
      let text = msg.text;
      let type = "text";
      if (msg.subtype === "meme") { type = "meme"; text = "[Meme image]"; }
      else if (msg.subtype === "quote") { type = "quote"; text = msg.text.split("|||")[0] + " — " + (msg.text.split("|||")[1] || ""); }
      else if (msg.subtype === "rename") { type = "rename"; text = msg.text.split("|||")[0] + " -> " + msg.text.split("|||")[1]; }
      else if (msg.subtype === "raise_hand") { type = "raise_hand"; }
      const user = msg.isSelf ? t("host.you") : msg.user;
      const escaped = text.replace(/"/g, '""');
      rows.push([time, user.replace(/"/g, '""'), escaped, type]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kitashare-chat-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chatMessages, t]);

  // Clear chat and files when sharing stops
  useEffect(() => {
    if (!isSharing) {
      setChatMessages([]);
      setShowChat(false);
      setSharedFiles([]);
      setShowFiles(false);
    }
  }, [isSharing]);

  // Raise hand notification auto-dismiss
  useEffect(() => {
    if (raiseHandNotifications.length > 0) {
      setShowRaiseHand(true);
      const timer = setTimeout(() => {
        setShowRaiseHand(false);
        setTimeout(() => setRaiseHandNotifications([]), 300);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [raiseHandNotifications]);

  // Meme/Quote picker
  const openPicker = useCallback(async (type: "meme" | "quote") => {
    setShowPicker(type);
    setPickerSearch("");
    setPickerLoading(true);
    setPickerItems([]);
    try {
      if (type === "meme") {
        const res = await fetch("https://api.github.com/repos/itsgucci/meme/contents/img?ref=master");
        const data = await res.json();
        const memes = data.filter((item: any) => item.type === "file" && item.download_url)
          .map((item: any) => ({ url: item.download_url }));
        for (let i = memes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [memes[i], memes[j]] = [memes[j], memes[i]];
        }
        setPickerItems(memes);
      } else {
        const res = await fetch("https://raw.githubusercontent.com/JamesFT/Database-Quotes-JSON/master/quotes.json");
        const data = await res.json();
        const quotes = data.map((q: any) => ({ text: q.quoteText, author: q.quoteAuthor || "Unknown" }));
        for (let i = quotes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [quotes[i], quotes[j]] = [quotes[j], quotes[i]];
        }
        setPickerItems(quotes);
      }
    } catch {
      setPickerItems([]);
    }
    setPickerLoading(false);
  }, []);

  const sendMeme = useCallback(async (url: string) => {
    setChatMessages((prev) => [...prev, { user: t("host.host"), text: url, timestamp: Date.now() / 1000, subtype: "meme", isSelf: true }]);
    sendChat(url, "meme").catch(() => {});
    setShowPicker(null);
  }, [t]);

  const sendQuote = useCallback(async (text: string, author: string) => {
    const combined = text + "|||" + author;
    setChatMessages((prev) => [...prev, { user: t("host.host"), text: combined, timestamp: Date.now() / 1000, subtype: "quote", isSelf: true }]);
    sendChat(combined, "quote").catch(() => {});
    setShowPicker(null);
  }, [t]);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    setChatMessages((prev) => [...prev, { user: t("host.host"), text, timestamp: Date.now() / 1000, subtype: "", isSelf: true }]);
    sendChat(text).catch(() => {});
    setChatInput("");
  }, [chatInput, t]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Monitor className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-brand text-lg font-bold">KitaShare</span>
        </div>
        <div className="flex items-center gap-1">
          {isSharing && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFiles(!showFiles)}
              aria-label={t("host.sharedFiles")}
              title={t("host.sharedFiles")}
              className="relative"
            >
              <FolderOpen className="h-5 w-5" />
              {sharedFiles.length > 0 && !showFiles && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {sharedFiles.length > 99 ? "99+" : sharedFiles.length}
                </span>
              )}
            </Button>
          )}
          {isSharing && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowChat(!showChat)}
              aria-label={t("host.chat")}
              title={t("host.chat")}
              className="relative"
            >
              <MessageSquare className="h-5 w-5" />
              {chatMessages.length > 0 && !showChat && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {chatMessages.length > 99 ? "99+" : chatMessages.length}
                </span>
              )}
            </Button>
          )}
          <LanguageSwitcher />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowA11y(!showA11y)}
            aria-label={t("settings.accessibility")}
            title={t("settings.accessibility")}
          >
            <Accessibility className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(!showSettings)}
            aria-label={t("settings.title")}
            title={t("settings.title")}
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-start justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-2xl space-y-6">
          {/* Loading Overlay */}
          {isStarting && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md">
              <div
                className="flex flex-col items-center gap-6 rounded-3xl border border-border bg-card p-10 shadow-2xl"
                style={{ animation: "overlayFadeIn 0.5s ease-out, overlayZoomIn 0.5s ease-out" }}
              >
                <div className="relative h-16 w-16">
                  <div className="absolute inset-0 rounded-full border-4 border-muted" />
                  <div
                    className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent"
                    style={{ animation: "overlaySpin 1.8s linear infinite" }}
                  />
                </div>
                <div className="flex flex-col items-center gap-3">
                  <p className="text-lg font-bold text-foreground">{t("common.startingShare")}</p>
                  <div className="flex gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full bg-primary"
                      style={{ animation: "overlayBounce 1.4s ease-in-out infinite", animationDelay: "0ms" }}
                    />
                    <span
                      className="h-2.5 w-2.5 rounded-full bg-primary"
                      style={{ animation: "overlayBounce 1.4s ease-in-out infinite", animationDelay: "200ms" }}
                    />
                    <span
                      className="h-2.5 w-2.5 rounded-full bg-primary"
                      style={{ animation: "overlayBounce 1.4s ease-in-out infinite", animationDelay: "400ms" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Status Card */}
          <Card className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {isSharing ? (
                      <Wifi className="h-5 w-5 text-success" />
                    ) : (
                      <MonitorOff className="h-5 w-5 text-muted-foreground" />
                    )}
                    {isSharing ? t("host.sharing") : t("host.notSharing")}
                  </CardTitle>
                  <CardDescription className="mt-1">{t("tagline")}</CardDescription>
                </div>
                <Badge variant={isSharing ? "success" : "default"}>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isSharing ? "bg-success animate-pulse" : "bg-muted-foreground"
                    }`}
                  />
                  {isSharing ? t("host.sharing") : t("host.notSharing")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error */}
              {error && (
                <div
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {/* Display selector */}
              {!isSharing && displays.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-semibold text-foreground">
                    {t("host.selectScreen")}
                  </label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {displays.map((display) => (
                      <button
                        key={display.index}
                        onClick={() => setSelectedDisplay(display.index)}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                          selectedDisplay === display.index
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50 hover:bg-accent"
                        }`}
                      >
                        <Monitor className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-semibold">
                            {t("host.display", { index: display.index + 1 })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {display.width}x{display.height}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quality & FPS (when not sharing) */}
              {!isSharing && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <Gauge className="h-4 w-4" />
                      {t("host.quality")}: {quality}%
                    </label>
                    <input
                      type="range"
                      min={30}
                      max={100}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-full accent-primary"
                      aria-label={t("host.quality")}
                    />
                  </div>
                  <div>
                    <label className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <Cpu className="h-4 w-4" />
                      {t("host.fps")}: {fps}
                    </label>
                    <div className="flex gap-1">
                      {[15, 24, 30, 60].map((f) => (
                        <button
                          key={f}
                          onClick={() => setFps(f)}
                          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                            fps === f
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-accent"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Share Mode Toggle (when not sharing) */}
              {!isSharing && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShareMode("lan")}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                        shareMode === "lan"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <Wifi className="h-4 w-4" />
                      LAN
                    </button>
                    <button
                      onClick={() => setShareMode("internet")}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                        shareMode === "internet"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <Globe className="h-4 w-4" />
                      Internet
                    </button>
                  </div>
                  {shareMode === "internet" && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                        Relay Server URL
                      </label>
                      <input
                        type="url"
                        value={relayUrl}
                        onChange={(e) => {
                          setRelayUrl(e.target.value);
                          localStorage.setItem("kitashare-relay-url", e.target.value);
                        }}
                        placeholder="https://kitashare.rmdigital.co.id"
                        className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Viewers will access via this URL. No login required — session link is auto-generated.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Start/Stop Button */}
              {isStarting ? (
                <Button disabled className="w-full" size="lg">
                  <Spinner className="h-5 w-5" />
                  {t("common.loading")}
                </Button>
              ) : isSharing ? (
                <Button variant="destructive" onClick={handleStop} className="w-full" size="lg">
                  <MonitorOff className="h-5 w-5" />
                  {t("host.stopSharing")}
                </Button>
              ) : (
                <Button variant="success" onClick={handleStart} className="w-full" size="lg">
                  <Monitor className="h-5 w-5" />
                  {t("host.startSharing")}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Sharer Profile (when sharing) */}
          {isSharing && (profile.name || profile.avatar || profile.bio) && (
            <Card>
              <CardContent className="flex items-center gap-4 pt-6">
                {profile.avatar ? (
                  <img src={profile.avatar} alt="Profile" className="h-14 w-14 rounded-full object-cover border-2 border-border" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border-2 border-border">
                    <User className="h-7 w-7 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{profile.name || t("host.anonymousHost")}</p>
                  {profile.bio && (
                    <p className="truncate text-sm text-muted-foreground">{profile.bio}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Session Info (when sharing) */}
          {isSharing && sessionInfo && (
            <Card>
              <CardHeader>
                <CardTitle>{t("host.sessionUrl")}</CardTitle>
                <CardDescription>{t("host.scanQr")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div
                    className="relative cursor-pointer rounded-xl border border-border bg-white p-4 transition-transform hover:scale-105"
                    onClick={() => setShowQrFullscreen(true)}
                    title="Click to enlarge QR"
                  >
                    <QRCodeSVG
                      value={sessionInfo.internetUrl || sessionInfo.url}
                      size={180}
                      level="M"
                      includeMargin={false}
                    />
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 opacity-0 transition-all hover:bg-black/10 hover:opacity-100">
                      <Maximize2 className="h-8 w-8 text-primary" />
                    </div>
                  </div>
                </div>

                {/* URL */}
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                    {sessionInfo.internetUrl || sessionInfo.url}
                  </code>
                  <Button variant="outline" size="icon" onClick={handleCopy} aria-label={t("copy")}>
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                    <Users className="mx-auto mb-1 h-5 w-5 text-primary" />
                    <p className="text-2xl font-bold">{sessionInfo.clients}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("host.clientsConnected", { count: sessionInfo.clients })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                    <Monitor className="mx-auto mb-1 h-5 w-5 text-primary" />
                    <p className="text-sm font-bold">
                      {sessionInfo.width}x{sessionInfo.height}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("host.resolution")}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/50 p-3 text-center">
                    <Gauge className="mx-auto mb-1 h-5 w-5 text-primary" />
                    <p className="text-2xl font-bold">{sessionInfo.fps}</p>
                    <p className="text-xs text-muted-foreground">{t("host.fps")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick Actions (when sharing) */}
          {isSharing && (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <button
                    onClick={() => setShowFiles(true)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition-all hover:border-primary hover:bg-primary/5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FolderOpen className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs font-semibold">Share Files</span>
                    {sharedFiles.length > 0 && (
                      <Badge variant="default" className="text-[10px]">{sharedFiles.length}</Badge>
                    )}
                  </button>
                  <button
                    onClick={() => setShowChat(true)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition-all hover:border-primary hover:bg-primary/5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs font-semibold">Chat</span>
                    {chatMessages.length > 0 && (
                      <Badge variant="default" className="text-[10px]">{chatMessages.length}</Badge>
                    )}
                  </button>
                  <button
                    onClick={() => setShowQrFullscreen(true)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition-all hover:border-primary hover:bg-primary/5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Maximize2 className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs font-semibold">{t("host.fullscreenQr")}</span>
                  </button>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 transition-all hover:border-primary hover:bg-primary/5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs font-semibold">{t("host.editProfile")}</span>
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Chat Panel */}
      {showChat && isSharing && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowChat(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <span className="font-semibold">{t("host.chat")}</span>
                {chatMessages.length > 0 && (
                  <Badge variant="default" className="text-xs">{chatMessages.length}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {chatMessages.length > 0 && (
                  <Button variant="ghost" size="icon" onClick={() => setShowExportConfirm(true)} aria-label={t("host.exportChat")} title={t("host.exportChat")}>
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setShowChat(false)} aria-label={t("host.closeChat")}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                  {t("host.noMessages")}
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.subtype === "rename" || msg.subtype === "raise_hand" ? "items-center" : msg.isSelf ? "items-end" : "items-start"}`}>
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      msg.subtype === "rename" ? "w-full bg-muted/50 border border-border text-center text-xs italic text-muted-foreground" :
                      msg.subtype === "raise_hand" ? "w-full bg-warning/15 border border-warning text-center text-xs font-semibold text-warning" :
                      msg.isSelf ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      {msg.subtype === "rename" ? (
                        <div>{t("host.renameMsg", { old: msg.text.split("|||")[0], new: msg.text.split("|||")[1] })}</div>
                      ) : msg.subtype === "raise_hand" ? (
                        <div>{msg.text}</div>
                      ) : (
                        <>
                      <div className="mb-0.5 text-xs font-semibold opacity-70">{msg.isSelf ? t("host.you") : msg.user}</div>
                      {msg.subtype === "meme" ? (
                        <img src={msg.text} alt="Meme" className="mt-1 max-w-full rounded-lg" loading="lazy" />
                      ) : msg.subtype === "quote" ? (
                        <div className="border-l-2 border-primary/50 pl-2 italic">
                          <div>{msg.text.split("|||")[0]}</div>
                          <div className="mt-1 text-xs not-italic opacity-70">— {msg.text.split("|||")[1] || t("host.unknown")}</div>
                        </div>
                      ) : (
                        <div>{msg.text}</div>
                      )}
                      </>
                      )}
                      <div className="mt-1 text-[10px] opacity-50">
                        {new Date(msg.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-border p-3">
              <div className="mb-2 flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openPicker("meme")}
                  className="flex-1 gap-1.5 text-xs"
                  aria-label={t("host.meme")}
                >
                  <Smile className="h-4 w-4" />
                  {t("host.meme")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openPicker("quote")}
                  className="flex-1 gap-1.5 text-xs"
                  aria-label={t("host.quote")}
                >
                  <Quote className="h-4 w-4" />
                  {t("host.quote")}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && chatInput.trim()) {
                      handleSendChat();
                    }
                  }}
                  placeholder={t("host.typeMessage")}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  maxLength={1000}
                />
                <Button
                  variant="default"
                  size="icon"
                  onClick={handleSendChat}
                  aria-label={t("host.send")}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meme/Quote Picker */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPicker(null)}>
          <div className="relative flex h-[70vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="font-semibold">{showPicker === "meme" ? t("host.meme") : t("host.quote")}</span>
              <Button variant="ghost" size="icon" onClick={() => setShowPicker(null)} aria-label={t("close")}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            {showPicker === "quote" && (
              <div className="border-b border-border p-3">
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder={t("host.typeMessage")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4">
              {pickerLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : showPicker === "meme" ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {pickerItems.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => item.url && sendMeme(item.url)}
                      className="overflow-hidden rounded-lg border border-border transition hover:border-primary"
                    >
                      <img src={item.url} alt="Meme" className="w-full" loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {pickerItems
                    .filter((item) => {
                      if (!pickerSearch) return true;
                      const f = pickerSearch.toLowerCase();
                      return (item.text || "").toLowerCase().includes(f) || (item.author || "").toLowerCase().includes(f);
                    })
                    .slice(0, 100)
                    .map((item, i) => (
                      <button
                        key={i}
                        onClick={() => item.text && sendQuote(item.text, item.author || t("host.unknown"))}
                        className="w-full rounded-lg border border-border p-3 text-left transition hover:border-primary"
                      >
                        <p className="text-sm italic">{item.text}</p>
                        <p className="mt-1 text-xs text-muted-foreground">— {item.author}</p>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* File Sharing Panel */}
      {showFiles && isSharing && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowFiles(false)} />
          <div className="relative flex h-full w-full max-w-sm flex-col border-l border-border bg-card shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                <span className="font-semibold">{t("host.sharedFiles")}</span>
                {sharedFiles.length > 0 && (
                  <Badge variant="default" className="text-xs">{sharedFiles.length}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    try {
                      const paths = await openFileDialog();
                      if (paths.length > 0) {
                        const added = await shareFiles(paths);
                        setSharedFiles((prev) => [...prev, ...added]);
                      }
                    } catch (err) {
                      console.error("Failed to add files:", err);
                    }
                  }}
                  aria-label={t("host.addFiles")}
                  title={t("host.addFiles")}
                >
                  <FilePlus2 className="h-5 w-5" />
                </Button>
                {sharedFiles.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      await clearFiles();
                      setSharedFiles([]);
                    }}
                    aria-label={t("host.clearAll")}
                    title={t("host.clearAll")}
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setShowFiles(false)} aria-label={t("close")}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            <div
              className={`flex-1 overflow-y-auto p-4 space-y-2 transition-colors ${isDragging ? "bg-primary/5" : ""}`}
            >
              {sharedFiles.length === 0 ? (
                <button
                  onClick={async () => {
                    try {
                      const paths = await openFileDialog();
                      if (paths.length > 0) {
                        const added = await shareFiles(paths);
                        setSharedFiles((prev) => [...prev, ...added]);
                      }
                    } catch (err) {
                      console.error("Failed to add files:", err);
                    }
                  }}
                  className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t("host.dragDropHint")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("host.dragDropOrClick")}</p>
                  </div>
                </button>
              ) : (
                sharedFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.size < 1024 ? `${file.size} B` :
                         file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` :
                         file.size < 1024 * 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` :
                         `${(file.size / 1024 / 1024 / 1024).toFixed(1)} GB`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        await removeFile(file.id);
                        setSharedFiles((prev) => prev.filter((f) => f.id !== file.id));
                      }}
                      aria-label={t("host.removeFile")}
                      title={t("host.removeFile")}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
              {isDragging && sharedFiles.length > 0 && (
                <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 p-4 text-sm font-medium text-primary">
                  <Upload className="mr-2 h-4 w-4" />
                  {t("host.dragDropHint")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QR Fullscreen Modal */}
      {showQrFullscreen && sessionInfo && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
          onClick={() => setShowQrFullscreen(false)}
        >
          <button
            className="absolute right-4 top-4 rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            onClick={() => setShowQrFullscreen(false)}
            aria-label={t("close")}
          >
            <X className="h-6 w-6" />
          </button>
          <div className="rounded-2xl bg-white p-8 shadow-2xl">
            <QRCodeSVG
              value={sessionInfo.url}
              size={Math.min(window.innerWidth - 80, window.innerHeight - 120, 400)}
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="mt-6 text-center text-lg font-semibold text-white">
            {sessionInfo.url}
          </p>
          <p className="mt-2 text-sm text-white/60">{t("host.scanQr")}</p>
        </div>
      )}

      {/* Raise Hand Notification */}
      {showRaiseHand && raiseHandNotifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-card p-4 shadow-lg">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20">
              <Hand className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                {t("host.raisedHandNotif", { user: raiseHandNotifications[0].user })}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(raiseHandNotifications[0].timestamp * 1000).toLocaleTimeString()}
              </p>
            </div>
            <button
              className="ml-2 rounded-lg p-1 text-muted-foreground hover:bg-accent"
              onClick={() => {
                setShowRaiseHand(false);
                setTimeout(() => setRaiseHandNotifications([]), 300);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowSettings(false)}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t("settings.title")}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Profile Section */}
              <div className="space-y-3 border-b border-border pb-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <User className="h-4 w-4" />
                  {t("host.sharerProfile")}
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {profile.avatar ? (
                      <img src={profile.avatar} alt="Avatar" className="h-16 w-16 rounded-full object-cover border-2 border-border" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted border-2 border-border">
                        <User className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <label className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary-hover">
                      <Camera className="h-3 w-3" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const result = reader.result as string;
                              const img = new Image();
                              img.onload = () => {
                                const canvas = document.createElement("canvas");
                                canvas.width = 128;
                                canvas.height = 128;
                                const ctx = canvas.getContext("2d");
                                if (ctx) {
                                  ctx.drawImage(img, 0, 0, 128, 128);
                                  profile.setAvatar(canvas.toDataURL("image/jpeg", 0.8));
                                }
                              };
                              img.src = result;
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      onBlur={() => profile.setName(profileName.trim())}
                      placeholder={t("host.yourName")}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      maxLength={50}
                    />
                  </div>
                </div>
                <textarea
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  onBlur={() => profile.setBio(profileBio.trim())}
                  placeholder={t("host.shortBio")}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                  rows={2}
                  maxLength={200}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("settings.darkMode")}</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("settings.language")}</span>
                <LanguageSwitcher />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Accessibility Panel */}
      {showA11y && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowA11y(false)}
        >
          <Card
            className="w-full max-w-md"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Accessibility className="h-5 w-5" />
                  {t("settings.accessibility")}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowA11y(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("settings.highContrast")}</span>
                <Switch
                  checked={a11y.highContrast}
                  onCheckedChange={a11y.toggleHighContrast}
                  aria-label={t("settings.highContrast")}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("settings.largeText")}</span>
                <Switch
                  checked={a11y.largeText}
                  onCheckedChange={a11y.toggleLargeText}
                  aria-label={t("settings.largeText")}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("settings.reducedMotion")}</span>
                <Switch
                  checked={a11y.reducedMotion}
                  onCheckedChange={a11y.toggleReducedMotion}
                  aria-label={t("settings.reducedMotion")}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t("settings.visualNotifications")}</span>
                <Switch
                  checked={a11y.visualNotifications}
                  onCheckedChange={a11y.toggleVisualNotifications}
                  aria-label={t("settings.visualNotifications")}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Export Chat Confirmation */}
      {showExportConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowExportConfirm(false)}
        >
          <Card
            className="w-full max-w-sm"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle>{t("host.exportChat")}</CardTitle>
              <CardDescription>{t("host.exportChatDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowExportConfirm(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  exportChatCsv();
                  setShowExportConfirm(false);
                }}
              >
                {t("host.exportChat")}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
