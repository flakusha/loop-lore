import { $, } from "../dom";
import {
  applyDirection,
  getSavedLocale,
  resolveKey,
  saveLocale,
  type TranslationMap,
} from "../i18n";
import { log as rootLog, } from "./logger";
import { initTelemetry, } from "./telemetry";

const log = rootLog.child({ module: "app", },);

globalThis.app = function() {
  return {
    toasts: [] as Array<{ type: string; msg: string; icon: string }>,
    currentTheme: "default",
    sidebarOpen: false,
    currentLocale: getSavedLocale(),
    // Seed from server-injected translations so Alpine bindings resolve
    // immediately, without waiting for the async loadLocale() fetch.
    localeStrings: ((globalThis as any).__localeStrings || {}) as TranslationMap,
    pageTitle: "loop-lore",

    __(key: string, fallback?: string,): string {
      const value = resolveKey(this.localeStrings as TranslationMap, key,);
      return value ?? fallback ?? key;
    },

    init() {
      initTelemetry();
      const initCount = ((globalThis as any).__appInitCount ?? 0) + 1;
      (globalThis as any).__appInitCount = initCount;
      log.debug("init", { initCount, },);

      const savedTheme = localStorage.getItem("theme-preference",);
      if (savedTheme) {
        this.currentTheme = savedTheme;
      }
      this.applyTheme(this.currentTheme,);

      // Load saved locale (cookie already set by server)
      const locale = getSavedLocale();
      this.currentLocale = locale;
      applyDirection(locale,);
      this.loadLocale(locale,);
    },

    applyTheme(themeId: string,) {
      const themes = globalThis.__THEMES ?? [];
      if (!themeId || themes.every((t: { id: string },) => t.id !== themeId)) { return; }
      for (const t of themes) {
        const link = $<HTMLLinkElement>(`#theme-${t.id}`,);
        if (link) { link.disabled = t.id !== themeId; }
      }
      document.body.classList.toggle("theme-no-icons", themeId === "no-icons",);
      localStorage.setItem("theme-preference", themeId,);
    },

    iconFor(type: string,) {
      const icons: Record<string, string> = { success: "✓", error: "✗", info: "ℹ", warning: "⚠", };
      return icons[type] || "ℹ";
    },

    closeAllModals() {
      this.sidebarOpen = false;
      if (!globalThis.Alpine) { return; }
      const ui = Alpine.store("ui",);
      if (ui) {
        for (const key of Object.keys(ui,)) {
          ui[key] = false;
        }
      }
    },

    async loadLocale(locale: string,) {
      try {
        const res = await fetch(`/locales/${locale}.json`,);
        if (res.ok) {
          const strings = await res.json() as TranslationMap;
          this.localeStrings = strings;
          globalThis.__localeStrings = strings as any;
          applyDirection(locale as any,);
        }
      } catch {
        // fallback to key display
      }
    },

    toast(type: string, message: string,) {
      this.toasts.push({ type, msg: message, icon: this.iconFor(type,), },);
      setTimeout(() => this.toasts.shift(), 5000,);
    },

    setTheme(themeId: string,) {
      this.currentTheme = themeId;
      this.applyTheme(themeId,);
    },

    getThemeName() {
      const themes = globalThis.__THEMES ?? [];
      const theme = themes.find((t: { id: string },) => t.id === this.currentTheme);
      return theme ? theme.name : "Default";
    },

    setLocale(localeId: string,) {
      saveLocale(localeId as any,);
      this.currentLocale = localeId;
      this.loadLocale(localeId,);
    },

    async logout() {
      try {
        await apiFetch("/api/auth/logout", { method: "POST", },);
      } catch {
        // best-effort: clear client session regardless of response
      } finally {
        globalThis.location.assign("/views/login",);
      }
    },
  };
};
