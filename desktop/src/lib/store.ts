import { create } from "zustand";

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
  setDark: (isDark: boolean) => void;
}

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const saved = localStorage.getItem("kitashare-theme");
const initialDark = saved ? saved === "dark" : prefersDark;

if (initialDark) document.documentElement.classList.add("dark");

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: initialDark,
  toggle: () => {
    const isDark = !get().isDark;
    set({ isDark });
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("kitashare-theme", isDark ? "dark" : "light");
  },
  setDark: (isDark: boolean) => {
    set({ isDark });
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("kitashare-theme", isDark ? "dark" : "light");
  },
}));

interface AccessibilityState {
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  visualNotifications: boolean;
  toggleHighContrast: () => void;
  toggleLargeText: () => void;
  toggleReducedMotion: () => void;
  toggleVisualNotifications: () => void;
}

const savedHC = localStorage.getItem("kitashare-contrast") === "high";
const savedLT = localStorage.getItem("kitashare-text-size") === "large";
const savedRM = localStorage.getItem("kitashare-reduced-motion") === "1";
const savedVN = localStorage.getItem("kitashare-visual-notify") !== "0";

if (savedHC) document.documentElement.setAttribute("data-contrast", "high");
if (savedLT) document.documentElement.setAttribute("data-text-size", "large");

export const useAccessibilityStore = create<AccessibilityState>((set, get) => ({
  highContrast: savedHC,
  largeText: savedLT,
  reducedMotion: savedRM,
  visualNotifications: savedVN,
  toggleHighContrast: () => {
    const v = !get().highContrast;
    set({ highContrast: v });
    document.documentElement.setAttribute("data-contrast", v ? "high" : "normal");
    localStorage.setItem("kitashare-contrast", v ? "high" : "normal");
  },
  toggleLargeText: () => {
    const v = !get().largeText;
    set({ largeText: v });
    document.documentElement.setAttribute("data-text-size", v ? "large" : "normal");
    localStorage.setItem("kitashare-text-size", v ? "large" : "normal");
  },
  toggleReducedMotion: () => {
    const v = !get().reducedMotion;
    set({ reducedMotion: v });
    localStorage.setItem("kitashare-reduced-motion", v ? "1" : "0");
  },
  toggleVisualNotifications: () => {
    const v = !get().visualNotifications;
    set({ visualNotifications: v });
    localStorage.setItem("kitashare-visual-notify", v ? "1" : "0");
  },
}));

interface SessionInfo {
  isSharing: boolean;
  url: string;
  wsUrl: string;
  localIp: string;
  port: number;
  clients: number;
  width: number;
  height: number;
  fps: number;
}

interface ShareState {
  isSharing: boolean;
  sessionInfo: SessionInfo | null;
  error: string | null;
  loading: boolean;
  setSharing: (info: SessionInfo | null) => void;
  setError: (err: string | null) => void;
  setLoading: (loading: boolean) => void;
  updateClients: (count: number) => void;
}

export const useShareStore = create<ShareState>((set) => ({
  isSharing: false,
  sessionInfo: null,
  error: null,
  loading: false,
  setSharing: (info) =>
    set({ isSharing: !!info, sessionInfo: info, error: null, loading: false }),
  setError: (err) => set({ error: err, loading: false }),
  setLoading: (loading) => set({ loading }),
  updateClients: (count) =>
    set((state) => ({
      sessionInfo: state.sessionInfo
        ? { ...state.sessionInfo, clients: count }
        : null,
    })),
}));

interface UserProfile {
  name: string;
  avatar: string;
  bio: string;
  setName: (name: string) => void;
  setAvatar: (avatar: string) => void;
  setBio: (bio: string) => void;
}

const savedName = localStorage.getItem("kitashare-profile-name") || "";
const savedAvatar = localStorage.getItem("kitashare-profile-avatar") || "";
const savedBio = localStorage.getItem("kitashare-profile-bio") || "";

export const useProfileStore = create<UserProfile>((set) => ({
  name: savedName,
  avatar: savedAvatar,
  bio: savedBio,
  setName: (name) => {
    localStorage.setItem("kitashare-profile-name", name);
    set({ name });
  },
  setAvatar: (avatar) => {
    localStorage.setItem("kitashare-profile-avatar", avatar);
    set({ avatar });
  },
  setBio: (bio) => {
    localStorage.setItem("kitashare-profile-bio", bio);
    set({ bio });
  },
}));
