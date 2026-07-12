import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "app" });

globalThis.app = function () {
  return {
    toasts: [] as Array<{ type: string; msg: string; icon: string }>,
    currentTheme: "default",
    sidebarOpen: false,
    currentLocale: "en",
    localeStrings: {} as Record<string, string>,
    pageTitle: "loop-lore",

    __(key: string, fallback?: string): string {
      return this.localeStrings[key] || fallback || key;
    },

    init() {
      const initCount = ((globalThis as any).__appInitCount ?? 0) + 1;
      (globalThis as any).__appInitCount = initCount;
      log.debug("init", { initCount });

      const savedTheme = localStorage.getItem("theme-preference");
      if (savedTheme) {
        this.currentTheme = savedTheme;
      }
      this.applyTheme(this.currentTheme);
      this.loadLocale("en");
    },

    applyTheme(themeId: string) {
      const themes = globalThis.__THEMES ?? [];
      if (!themeId || themes.every((t: { id: string }) => t.id !== themeId)) return;
      for (const t of themes) {
        const link = document.querySelector(`#theme-${t.id}`) as HTMLLinkElement | null;
        if (link) link.disabled = t.id !== themeId;
      }
      document.body.classList.toggle("theme-no-icons", themeId === "no-icons");
      localStorage.setItem("theme-preference", themeId);
    },

    iconFor(type: string) {
      const icons: Record<string, string> = { success: "✓", error: "✗", info: "ℹ", warning: "⚠" };
      return icons[type] || "ℹ";
    },

    closeAllModals() {
      this.sidebarOpen = false;
      if (!globalThis.Alpine) return;
      const ui = Alpine.store("ui");
      if (ui) {
        for (const key of Object.keys(ui)) {
          ui[key] = false;
        }
      }
    },

    async loadLocale(locale: string) {
      try {
        const res = await fetch(`/locales/${locale}.json`);
        if (res.ok) {
          const strings = await res.json();
          this.localeStrings = strings;
          globalThis.__localeStrings = strings;
        }
      } catch {
        // fallback
      }
    },

    toast(type: string, message: string) {
      this.toasts.push({ type, msg: message, icon: this.iconFor(type) });
      setTimeout(() => this.toasts.shift(), 5000);
    },

    setTheme(themeId: string) {
      this.currentTheme = themeId;
      this.applyTheme(themeId);
    },

    getThemeName() {
      const themes = globalThis.__THEMES ?? [];
      const theme = themes.find((t: { id: string }) => t.id === this.currentTheme);
      return theme ? theme.name : "Default";
    },

    setLocale(localeId: string) {
      localStorage.setItem("locale", localeId);
      this.currentLocale = localeId;
      this.loadLocale(localeId);
    },
  };
};
