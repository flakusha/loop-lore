// ── Settings page component (settings.html) ────────────────

globalThis.settingsPage = function () {
  return {
    currentTheme: "default",
    currentLocale: "en",
    enterToSend: true,
    autoScroll: true,
    inlinePreview: true,
    detailLevel: "Basic",
    apiProvider: "OpenAI",
    apiKey: "",
    apiEndpoint: "",
    apiModel: "",
    maxTokens: 4096,
    temperature: 1,
    confirmDeleteText: "",

    init() {
      (this as any).$root.pageTitle = "Settings";
      const savedTheme = localStorage.getItem("theme-preference");
      if (savedTheme) {
        this.currentTheme = savedTheme;
      }
      this.setTheme(this.currentTheme);
      const savedLocale = localStorage.getItem("locale");
      if (savedLocale) {
        this.currentLocale = savedLocale;
      }
    },

    setTheme(themeId: string) {
      const Alpine = globalThis.Alpine;
      if (Alpine) {
        const rootData = Alpine.$data(document.body);
        if (rootData && typeof rootData.setTheme === "function") {
          rootData.setTheme(themeId);
        }
      }
      this.currentTheme = themeId;
    },

    setLocale(localeId: string) {
      const Alpine = globalThis.Alpine;
      if (Alpine) {
        const rootData = Alpine.$data(document.body);
        if (rootData && typeof rootData.setLocale === "function") {
          rootData.setLocale(localeId);
        }
      }
      this.currentLocale = localeId;
    },
  };
};
