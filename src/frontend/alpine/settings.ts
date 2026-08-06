import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "settings", },);

interface LocaleInfo {
  id: string;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
}

type LocaleInfoArray = LocaleInfo[];

(globalThis as any).settingsPage = function() {
  return {
    activeTab: "general",
    displayName: "",
    birthDate: "",
    theme: "default",
    locale: "en",
    locales: [] as LocaleInfoArray,
    enterToSend: true,
    autoScroll: true,
    inlinePreview: true,
    detailLevel: "Immersion",
    provider: "OpenAI",
    apiKey: "",
    apiEndpoint: "",
    model: "",
    maxTokens: 128_000,
    temperature: 1,
    confirmDeleteText: "",
    saving: false,
    loaded: false,
    nsfwConsent: null as null | {
      nsfwEnabled: boolean;
      maxRating: string;
      blockedFromNsfw: boolean;
      bannedFromNsfw: boolean;
      shadowNsfw: boolean;
      blockReason: string | null;
    },

    async init() {
      const savedTheme = localStorage.getItem("theme-reference",);
      if (savedTheme) { this.theme = savedTheme; }
      const savedLocale = localStorage.getItem("locale",);
      if (savedLocale) { this.locale = savedLocale; }
      const enter = localStorage.getItem("chat-enter-to-send",);
      if (enter !== null) { this.enterToSend = enter === "1"; }
      const scroll = localStorage.getItem("chat-auto-scroll",);
      if (scroll !== null) { this.autoScroll = scroll === "1"; }
      const preview = localStorage.getItem("chat-inline-preview",);
      if (preview !== null) { this.inlinePreview = preview === "1"; }
      const detail = localStorage.getItem("chat-detail-level",);
      if (detail) { this.detailLevel = detail; }
      await this.loadLocales();
      await this.loadSettings();
      await this.loadNsfwConsent();
    },

    async loadLocales() {
      try {
        const res = await apiFetch("/api/i18n/locales", { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const data = await res.json();
          this.locales = data.locales as LocaleInfoArray;
        }
      } catch (error) {
        log.warn("loadLocales failed", { error: String(error,), },);
        // Fallback to default locales
        this.locales = [
          { id: "en", name: "English", nativeName: "English", direction: "ltr", },
          { id: "es", name: "Spanish", nativeName: "Español", direction: "ltr", },
          { id: "fr", name: "French", nativeName: "Français", direction: "ltr", },
          { id: "de", name: "German", nativeName: "Deutsch", direction: "ltr", },
          { id: "ja", name: "Japanese", nativeName: "日本語", direction: "ltr", },
          { id: "ko", name: "Korean", nativeName: "한국어", direction: "ltr", },
          { id: "zh", name: "Chinese", nativeName: "中文", direction: "ltr", },
          { id: "pt", name: "Portuguese", nativeName: "Português", direction: "ltr", },
          { id: "ru", name: "Russian", nativeName: "Русский", direction: "ltr", },
          { id: "ar", name: "Arabic", nativeName: "العربية", direction: "rtl", },
        ];
      }
    },

    async loadSettings() {
      try {
        const res = await apiFetch("/api/settings", { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const settings = await res.json();
          if (settings.displayName) { this.displayName = settings.displayName; }
          if (settings.birthDate) { this.birthDate = settings.birthDate; }
          if (settings.theme) { this.theme = settings.theme; }
          if (settings.locale) { this.locale = settings.locale; }
          if (settings.provider) { this.provider = settings.provider; }
          if (settings.apiEndpoint) { this.apiEndpoint = settings.apiEndpoint; }
          if (settings.model) { this.model = settings.model; }
          if (settings.maxTokens) { this.maxTokens = settings.maxTokens; }
          if (typeof settings.temperature === "number") { this.temperature = settings.temperature; }
          if (settings.detailLevel) { this.detailLevel = settings.detailLevel; }
        }
      } catch (error) {
        log.warn("loadSettings failed", { error: String(error,), },);
      }
      this.loaded = true;
    },

    /** Fetch the acting user's stored NSFW consent (enabled state, rating, restrictions). */
    async loadNsfwConsent() {
      const userId = (globalThis as any).__USER_ID as string | undefined;
      if (!userId) { return; }
      try {
        const res = await apiFetch(`/api/nsfw/moderation/preferences/${encodeURIComponent(userId,)}`, {
          headers: { Accept: "application/json", },
        },);
        if (res.ok) {
          const body = await res.json() as { data?: Record<string, unknown> };
          const d = body.data;
          if (d && typeof d === "object") {
            this.nsfwConsent = {
              nsfwEnabled: d.nsfwEnabled === true,
              maxRating: typeof d.maxRating === "string" ? d.maxRating : "",
              blockedFromNsfw: d.blockedFromNsfw === true,
              bannedFromNsfw: d.bannedFromNsfw === true,
              shadowNsfw: d.shadowNsfw === true,
              blockReason: typeof d.blockReason === "string" ? d.blockReason : null,
            };
          }
        }
      } catch (error) {
        log.warn("loadNsfwConsent failed", { error: String(error,), },);
      }
    },

    /** Human-readable summary of any NSFW access restrictions on this account. */
    nsfwRestrictionText() {
      if (!this.nsfwConsent) { return ""; }
      const g = globalThis as { t?: (key: string,) => string };
      const t = g.t ?? ((key: string,) => key);
      const parts: string[] = [];
      if (this.nsfwConsent.blockedFromNsfw) { parts.push(t("settings.nsfwBlocked",),); }
      if (this.nsfwConsent.bannedFromNsfw) { parts.push(t("settings.nsfwBanned",),); }
      if (this.nsfwConsent.shadowNsfw) { parts.push(t("settings.nsfwShadow",),); }
      if (parts.length > 0) {
        const appended = this.nsfwConsent.blockReason ? ` — ${this.nsfwConsent.blockReason}` : "";
        return parts.join(", ",) + appended;
      }
      return t("settings.nsfwNone",);
    },

    async saveGeneral() {
      await this.persistSettings({
        displayName: this.displayName,
        birthDate: this.birthDate,
        theme: this.theme,
        locale: this.locale,
      },);
    },

    /**
     * Handle a locale switch from the preferences select.
     * Persists the choice, sets the server-side locale cookie, then reloads so
     * the server re-serves views rendered in the new locale.
     */
    async onLocaleChange() {
      await this.saveGeneral();
      // Cookie is read by server-side locale detection on reload.
      // eslint-disable-next-line unicorn/no-document-cookie
      document.cookie = `ll_locale=${this.locale}; path=/; SameSite=Lax; max-age=31536000`;
      globalThis.location.reload();
    },

    async saveChat() {
      localStorage.setItem("chat-enter-to-send", this.enterToSend ? "1" : "0",);
      localStorage.setItem("chat-auto-scroll", this.autoScroll ? "1" : "0",);
      localStorage.setItem("chat-inline-preview", this.inlinePreview ? "1" : "0",);
      localStorage.setItem("chat-detail-level", this.detailLevel,);
      await this.persistSettings({ detailLevel: this.detailLevel, },);
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
        if (this.apiEndpoint) { payload.apiEndpoint = this.apiEndpoint; }
        if (this.apiKey) { payload.apiKey = this.apiKey; }
        await this.persistSettings(payload,);
        this.apiKey = "";
      } finally {
        this.saving = false;
      }
    },

    async testConnection() {
      try {
        const res = await apiFetch("/api/generation/test-connection", { method: "POST", },);
        if (res.ok) {
          log.info("Connection test succeeded",);
        } else {
          log.warn("Connection test failed",);
        }
      } catch (error) {
        log.warn("Connection test error", { error: String(error,), },);
      }
    },

    async persistSettings(payload: Record<string, unknown>,) {
      try {
        if (payload.theme) {
          const themes = (globalThis as any).__THEMES ?? [];
          if (themes.every((t: any,) => t.id !== payload.theme)) { return; }
          for (const t of themes) {
            const link = document.querySelector(`#theme-${t.id}`,) as HTMLLinkElement | null;
            if (link) { link.disabled = t.id !== payload.theme; }
          }
          document.body.classList.toggle("theme-no-icons", payload.theme === "no-icons",);
          localStorage.setItem("theme-preference", payload.theme as string,);
        }
        if (payload.locale) {
          localStorage.setItem("locale", payload.locale as string,);
          // Use new i18n API endpoint for locale
          await apiFetch("/api/i18n/locale", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Accept: "application/json", },
            body: jsonBody({ locale: payload.locale, },),
          },);
          // Reload translations in the app
          const appEl = document.querySelector("[x-data]",) as HTMLElement | null;
          if (appEl) {
            const appData = Alpine.$data(appEl,) as any;
            if (appData?.setLocale) {
              appData.setLocale(payload.locale as string,);
            }
          }
        }
        const res = await apiFetch("/api/users/me/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonBody(payload,),
        },);
        if (res.ok && payload.displayName) {
          await apiFetch("/api/users/me", {
            method: "PUT",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ displayName: payload.displayName, },),
          },);
        }
      } catch (error) {
        log.warn("persistSettings failed", { error: String(error,), },);
      }
    },

    clearApiKey() {
      this.apiKey = "";
    },

    async exportAllData() {
      try {
        const res = await apiFetch("/api/settings/export",);
        if (!res.ok) {
          showToast("error", "Export failed",);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob,);
        const a = document.createElement("a",);
        a.href = url;
        a.download = "loop-lore-export.zip";
        document.body.append(a,);
        a.click();
        a.remove();
        showToast("success", "Export downloaded",);
        setTimeout(() => URL.revokeObjectURL(url,), 1000,);
      } catch (error) {
        log.warn("exportAllData failed", { error: String(error,), },);
        showToast("error", "Export failed",);
      }
    },

    onProviderChange() {
      const endpointGroup = document.querySelector("#api-endpoint-group",) as HTMLElement | null;
      if (endpointGroup) {
        endpointGroup.style.display = this.provider === "Custom" ? "" : "none";
      }
    },

    onTempInput() {
      const label = document.querySelector("#temp-value",);
      if (label) { label.textContent = Number(this.temperature,).toFixed(1,); }
    },

    onConfirmDeleteInput() {
      const btn = document.querySelector("#delete-all-btn",) as HTMLButtonElement | null;
      if (btn) { btn.disabled = this.confirmDeleteText !== "DELETE"; }
    },

    async deleteAllData() {
      if (this.confirmDeleteText !== "DELETE") { return; }
      if (!confirm("This will permanently delete ALL your data. Continue?",)) { return; }
      try {
        const res = await apiFetch("/api/users/me", { method: "DELETE", },);
        if (!res.ok) { throw new Error("Delete failed",); }
      } catch (error) {
        log.warn("deleteAllData failed", { error: String(error,), },);
      }
    },
  };
};
