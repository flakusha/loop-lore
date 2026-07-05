// ── Root app component (layout.html) ───────────────────────

globalThis.app = function () {
  return {
    toasts: [] as Array<{ type: string; msg: string; icon: string }>,
    currentTheme: "default",
    sidebarOpen: false,
    currentLocale: "en",

    init() {
      const savedTheme = localStorage.getItem("theme-preference");
      const themes = globalThis.__THEMES ?? [];
      if (savedTheme && themes.some((t: { id: string }) => t.id === savedTheme)) {
        this.currentTheme = savedTheme;
      }
      this.applyTheme(this.currentTheme);
      this.loadLocale("en");

      document.addEventListener(
        "show-toast",
        (e: CustomEvent<{ type?: string; message: string; icon?: string }>) => {
          this.toasts.push({
            type: e.detail.type || "info",
            msg: e.detail.message,
            icon: e.detail.icon || this.iconFor(e.detail.type || "info"),
          });
          setTimeout(() => this.toasts.shift(), 5000);
        },
      );
    },

    applyTheme(themeId: string) {
      const themes = globalThis.__THEMES ?? [];
      const theme = themes.find((t: { id: string }) => t.id === themeId);
      if (!theme) return;

      for (const t of themes) {
        const link = document.querySelector(`#theme-${t.id}`);
        if (link) {
          (link as HTMLLinkElement).disabled = true;
        }
      }

      const selectedLink = document.querySelector(`#theme-${themeId}`);
      if (selectedLink) {
        (selectedLink as HTMLLinkElement).disabled = false;
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
      document.querySelectorAll("[x-data]").forEach((el) => {
        try {
          const data = (globalThis as any).Alpine?.$data(el) ?? (el as any)._x_dataStack?.[0];
          if (data && (data as Record<string, unknown>).showModal != null) {
            (data as Record<string, unknown>).showModal = false;
          }
        } catch {
          /* element may not have Alpine data yet */
        }
      });
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

    async loadLocale(locale: string) {
      try {
        const res = await fetch(`/locales/${locale}.json`);
        if (res.ok) {
          globalThis.__localeStrings = await res.json();
        }
      } catch {
        // fallback: keys display as-is
      }
    },

    setLocale(localeId: string) {
      localStorage.setItem("locale", localeId);
      this.currentLocale = localeId;
      this.loadLocale(localeId);
    },
  };
};
