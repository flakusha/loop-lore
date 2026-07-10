import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "settings" });

/**
 * Settings page Alpine component.
 * Manages general/chat/api/data settings tabs.
 */
globalThis.settingsPage = function () {
  return {
    displayName: "",
    birthDate: "",
    theme: "default",
    locale: "en",
    enterToSend: true,
    autoScroll: true,
    inlinePreview: true,
    detailLevel: "Immersion",
    provider: "OpenAI",
    apiKey: "",
    apiEndpoint: "",
    model: "",
    maxTokens: 128000,
    temperature: 1.0,
    confirmDeleteText: "",
    saving: false,
    loaded: false,

    async init() {
      const initCount = ((globalThis as any).__settingsInitCount ?? 0) + 1;
      (globalThis as any).__settingsInitCount = initCount;
      log.debug("init", { initCount });

      const savedTheme = localStorage.getItem("theme-reference");
      if (savedTheme) this.theme = savedTheme;
      const savedLocale = localStorage.getItem("locale");
      if (savedLocale) this.locale = savedLocale;

      const enter = localStorage.getItem("chat-enter-to-send");
      if (enter !== null) this.enterToSend = enter === "1";
      const scroll = localStorage.getItem("chat-auto-scroll");
      if (scroll !== null) this.autoScroll = scroll === "1";
      const preview = localStorage.getItem("chat-inline-preview");
      if (preview !== null) this.inlinePreview = preview === "1";
      const detail = localStorage.getItem("chat-detail-level");
      if (detail) this.detailLevel = detail;

      await this.loadSettings();
    },

    async loadSettings() {
      try {
        const res = await fetch("/api/settings", { headers: { Accept: "application/json" } });
        if (res.ok) {
          const settings = await res.json();
          if (settings.displayName) this.displayName = settings.displayName;
          if (settings.birthDate) this.birthDate = settings.birthDate;
          if (settings.theme) this.theme = settings.theme;
          if (settings.locale) this.locale = settings.locale;
          if (settings.provider) this.provider = settings.provider;
          if (settings.apiEndpoint) this.apiEndpoint = settings.apiEndpoint;
          if (settings.model) this.model = settings.model;
          if (settings.maxTokens) this.maxTokens = settings.maxTokens;
          if (typeof settings.temperature === "number") this.temperature = settings.temperature;
          if (settings.detailLevel) this.detailLevel = settings.detailLevel;
        }
      } catch (e) {
        log.warn("loadSettings failed", { error: String(e) });
      }
      this.loaded = true;
    },

    async saveGeneral() {
      await this.persistSettings({
        displayName: this.displayName,
        birthDate: this.birthDate,
        theme: this.theme,
        locale: this.locale,
      });
    },

    async saveChat() {
      localStorage.setItem("chat-enter-to-send", this.enterToSend ? "1" : "0");
      localStorage.setItem("chat-auto-scroll", this.autoScroll ? "1" : "0");
      localStorage.setItem("chat-inline-preview", this.inlinePreview ? "1" : "0");
      localStorage.setItem("chat-detail-level", this.detailLevel);
      await this.persistSettings({
        detailLevel: this.detailLevel,
      });
      window.showToast?.(success", "Chat settings saved");
    },

    async saveApi() {
      this.saving = true;
      try {
        const payload: Record<string, unknown> = {
          provider: this.provider,
          model: this.model,
          maxTokens: this.maxTokens,
          temperature: this.temperature,
        };
        if (this.apiEndpoint) payload.apiEndpoint = this.apiEndpoint;
        if (this.apiKey) payload.apiKey = this.apiKey;

        const res = await fetch("/api/users/me/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          window.showToast?.(success", "API settings saved");
          this.apiKey = "";
        } else {
          window.showToast?.(error", "Failed to save API settings");
        }
      } finally {
        this.saving = false;
      }
    },

    async testConnection() {
      try {
        const res = await fetch("/api/generation/test-connection", { method: "POST" });
        if (res.ok) {
          window.showToast?.(success", "Connection successful");
        } else {
          window.showToast?.(error", "Connection failed");
        }
      } catch {
        window.showToast?.(error", "Connection test error");
      }
    },

    async persistSettings(payload: Record<string, unknown>) {
      try {
        if (payload.theme) window.setTheme?(payload.theme as string);
        if (payload.locale) window.setLocale?(payload.locale as string);

        const res = await fetch("/api/users/me/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          window.showToast?.(success", "Settings saved");
          if (payload.displayName) {
            await fetch("/api/users/me", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ displayName: payload.displayName }),
            });
          }
        } else {
          window.showToast?.(error", "Failed to save settings");
        }
      } catch (e) {
        log.warn("persistSettings failed", { error: String(e) });
      }
    },

    clearApiKey() {
      this.apiKey = "";
    },

    onProviderChange() {
      const endpointGroup = document.getElementById("api-endpoint-group");
      if (endpointGroup) {
        endpointGroup.style.display = this.provider === "Custom" ? "" : "none";
      }
    },

    onTempInput() {
      const label = document.getElementById("temp-value");
      if (label) label.textContent = Number(this.temperature).toFixed(1);
    },

    onConfirmDeleteInput() {
      const btn = document.getElementById("delete-all-btn") as HTMLButtonElement | null;
      if (btn) btn.disabled = this.confirmDeleteText !== "DELETE";
    },

    async deleteAllData() {
      if (this.confirmDeleteText !== "DELETE") return;
      if (!confirm("This will permanently delete ALL your data. Continue?")) return;
      try {
        const res = await fetch("/api/users/me", { method: "DELETE" });
        if (res.ok) {
          window.showToast?.(success", "All data deleted");
        } else {
          window.showToast?.(error", "Failed to delete data");
        }
      } catch {
        window.showToast?.(error", "Delete error");
      }
    },
  };
};
