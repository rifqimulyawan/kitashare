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
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "./components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./components/ui/Card";
import { Badge } from "./components/ui/Badge";
import { Switch } from "./components/ui/Switch";
import { Spinner } from "./components/ui/Spinner";
import { ThemeToggle } from "./components/shared/ThemeToggle";
import { LanguageSwitcher } from "./components/shared/LanguageSwitcher";
import { useShareStore, useAccessibilityStore } from "./lib/store";
import {
  startSharing,
  stopSharing,
  getSessionInfo,
  getAvailableDisplays,
  type SessionInfo,
  type DisplayInfo,
} from "./lib/tauri-bridge";

export default function App() {
  const { t } = useTranslation();
  const { isSharing, sessionInfo, error, loading, setSharing, setError, setLoading, updateClients } =
    useShareStore();
  const a11y = useAccessibilityStore();

  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [selectedDisplay, setSelectedDisplay] = useState(0);
  const [quality, setQuality] = useState(75);
  const [fps, setFps] = useState(30);
  const [port] = useState(8080);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showA11y, setShowA11y] = useState(false);

  useEffect(() => {
    getAvailableDisplays()
      .then(setDisplays)
      .catch(() => setDisplays([{ index: 0, width: 1920, height: 1080 }]));
  }, []);

  // Poll client count when sharing
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

  const handleStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await startSharing(selectedDisplay, quality, fps, port);
      setSharing(info);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }, [selectedDisplay, quality, fps, port, setSharing, setError, setLoading]);

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
    navigator.clipboard.writeText(sessionInfo.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sessionInfo]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Monitor className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-brand text-lg font-bold">YourShare</span>
        </div>
        <div className="flex items-center gap-1">
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

              {/* Start/Stop Button */}
              {loading ? (
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
                  <div className="rounded-xl border border-border bg-white p-4">
                    <QRCodeSVG
                      value={sessionInfo.url}
                      size={180}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                </div>

                {/* URL */}
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                    {sessionInfo.url}
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
        </div>
      </main>

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
    </div>
  );
}
