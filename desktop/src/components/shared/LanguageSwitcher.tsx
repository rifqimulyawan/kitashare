import { useState, useRef, useEffect } from "react";
import { Globe, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { languages, changeLanguage } from "../../i18n";
import { cn } from "../../lib/utils";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentLang = languages.find((l) => l.code === i18n.language) || languages[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Change language"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Globe className="h-5 w-5" />
        <span className="text-xs font-bold uppercase">{currentLang.code}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-12 z-50 min-w-[180px] overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          role="listbox"
        >
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                changeLanguage(lang.code);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-accent",
                i18n.language === lang.code && "bg-primary/10"
              )}
              role="option"
              aria-selected={i18n.language === lang.code}
            >
              <div className="text-left">
                <p className="font-semibold text-foreground">{lang.native}</p>
                <p className="text-xs text-muted-foreground">{lang.label}</p>
              </div>
              {i18n.language === lang.code && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
