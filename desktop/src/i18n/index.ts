import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      appName: "YourShare",
      tagline: "Share your screen instantly",
      start: "Start",
      stop: "Stop",
      settingsLabel: "Settings",
      close: "Close",
      cancel: "Cancel",
      copy: "Copy",
      copied: "Copied!",
      host: {
        startSharing: "Start Sharing",
        stopSharing: "Stop Sharing",
        selectScreen: "Select Screen",
        quality: "Quality",
        fps: "Frame Rate",
        port: "Port",
        clientsConnected: "{{count}} viewer(s) connected",
        sessionUrl: "Share URL",
        scanQr: "Scan QR to join",
        noViewers: "No viewers connected",
        sharing: "Sharing",
        notSharing: "Not Sharing",
        display: "Display {{index}}",
        resolution: "Resolution",
      },
      settings: {
        title: "Settings",
        appearance: "Appearance",
        darkMode: "Dark Mode",
        language: "Language",
        accessibility: "Accessibility",
        highContrast: "High Contrast",
        largeText: "Large Text",
        reducedMotion: "Reduced Motion",
        visualNotifications: "Visual Notifications",
        focusRingThickness: "Focus Ring Thickness",
      },
      common: {
        error: "Error",
        success: "Success",
        loading: "Loading...",
        confirm: "Confirm",
        yes: "Yes",
        no: "No",
      },
    },
  },
  id: {
    translation: {
      appName: "YourShare",
      tagline: "Bagikan layar Anda secara instan",
      start: "Mulai",
      stop: "Berhenti",
      settingsLabel: "Pengaturan",
      close: "Tutup",
      cancel: "Batal",
      copy: "Salin",
      copied: "Tersalin!",
      host: {
        startSharing: "Mulai Berbagi",
        stopSharing: "Berhenti Berbagi",
        selectScreen: "Pilih Layar",
        quality: "Kualitas",
        fps: "Frame Rate",
        port: "Port",
        clientsConnected: "{{count}} penonton terhubung",
        sessionUrl: "URL Berbagi",
        scanQr: "Pindai QR untuk bergabung",
        noViewers: "Tidak ada penonton",
        sharing: "Sedang Berbagi",
        notSharing: "Tidak Berbagi",
        display: "Layar {{index}}",
        resolution: "Resolusi",
      },
      settings: {
        title: "Pengaturan",
        appearance: "Tampilan",
        darkMode: "Mode Gelap",
        language: "Bahasa",
        accessibility: "Aksesibilitas",
        highContrast: "Kontras Tinggi",
        largeText: "Teks Besar",
        reducedMotion: "Kurangi Animasi",
        visualNotifications: "Notifikasi Visual",
        focusRingThickness: "Tebal Fokus Ring",
      },
      common: {
        error: "Error",
        success: "Berhasil",
        loading: "Memuat...",
        confirm: "Konfirmasi",
        yes: "Ya",
        no: "Tidak",
      },
    },
  },
  ar: {
    translation: {
      appName: "YourShare",
      tagline: "شارك شاشتك فوراً",
      start: "ابدأ",
      stop: "إيقاف",
      settingsLabel: "الإعدادات",
      close: "إغلاق",
      cancel: "إلغاء",
      copy: "نسخ",
      copied: "تم النسخ!",
      host: {
        startSharing: "ابدأ المشاركة",
        stopSharing: "إيقاف المشاركة",
        selectScreen: "اختر الشاشة",
        quality: "الجودة",
        fps: "معدل الإطارات",
        port: "المنفذ",
        clientsConnected: "{{count}} مشاهد متصل",
        sessionUrl: "رابط المشاركة",
        scanQr: "امسح QR للانضمام",
        noViewers: "لا يوجد مشاهدون",
        sharing: "مشاركة",
        notSharing: "غير مشارك",
        display: "شاشة {{index}}",
        resolution: "الدقة",
      },
      settings: {
        title: "الإعدادات",
        appearance: "المظهر",
        darkMode: "الوضع الداكن",
        language: "اللغة",
        accessibility: "إمكانية الوصول",
        highContrast: "تباين عالي",
        largeText: "نص كبير",
        reducedMotion: "تقليل الحركة",
        visualNotifications: "إشعارات مرئية",
        focusRingThickness: "سماكة حلقة التركيز",
      },
      common: {
        error: "خطأ",
        success: "نجح",
        loading: "جارٍ التحميل...",
        confirm: "تأكيد",
        yes: "نعم",
        no: "لا",
      },
    },
  },
};

const savedLang = localStorage.getItem("yourshare-lang") || "en";

i18n.use(initReactI18next).init({
  resources,
  lng: savedLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export const languages = [
  { code: "en", label: "English", native: "English", dir: "ltr" },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia", dir: "ltr" },
  { code: "ar", label: "Arabic", native: "العربية", dir: "rtl" },
];

export function changeLanguage(lang: string) {
  i18n.changeLanguage(lang);
  localStorage.setItem("yourshare-lang", lang);
  const dir = languages.find((l) => l.code === lang)?.dir || "ltr";
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
}

const initDir = languages.find((l) => l.code === savedLang)?.dir || "ltr";
document.documentElement.dir = initDir;
document.documentElement.lang = savedLang;

export default i18n;
