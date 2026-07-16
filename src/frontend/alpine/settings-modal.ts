import { jsonBody } from "./json";

(globalThis as any).settingsModal = function () {
  return {
    open: false,
    tab: "theme",
    theme: localStorage.getItem("theme-preference") || "default",
    enterToSend: localStorage.getItem("chat-enter-to-send") !== "0",
    autoScroll: localStorage.getItem("chat-auto-scroll") !== "0",
    detailLevel: localStorage.getItem("chat-detail-level") || "Immersion",
    provider: "OpenAI",
    model: "",
    temperature: 1.0,

    async load() {
      try {
        const res = await fetch("/api/settings", { headers: { Accept: "application/json" } });
        if (res.ok) {
          const s = await res.json();
          if (s.theme) this.theme = s.theme;
          if (s.provider) this.provider = s.provider;
          if (s.model) this.model = s.model;
          if (typeof s.temperature === "number") this.temperature = s.temperature;
          if (s.detailLevel) this.detailLevel = s.detailLevel;
        }
      } catch {
        /* ignore */
      }
    },

    async save(section: string) {
      const payload: Record<string, unknown> = {};
      if (this.tab === "theme" || section === "theme") {
        payload.theme = this.theme;
        await this.applyTheme();
      }
      if (this.tab === "chat" || section === "chat") {
        payload.detailLevel = this.detailLevel;
        localStorage.setItem("chat-enter-to-send", this.enterToSend ? "1" : "0");
        localStorage.setItem("chat-auto-scroll", this.autoScroll ? "1" : "0");
        localStorage.setItem("chat-detail-level", this.detailLevel);
      }
      if (this.tab === "generation" || section === "api") {
        payload.provider = this.provider;
        payload.model = this.model;
        payload.temperature = this.temperature;
      }
      try {
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: jsonBody(payload),
        });
      } catch {
        /* ignore */
      }
    },

    applyTheme() {
      const themes = globalThis.__THEMES ?? [];
      if (themes.every((t: any) => t.id !== this.theme)) return;
      for (const t of themes) {
        const link = document.querySelector("#theme-" + t.id) as HTMLLinkElement | null;
        if (link) link.disabled = t.id !== this.theme;
      }
      document.body.classList.toggle("theme-no-icons", this.theme === "no-icons");
      localStorage.setItem("theme-preference", this.theme);
    },
  };
};
