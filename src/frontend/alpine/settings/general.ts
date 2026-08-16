// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { log as rootLog, } from "../logger";
import type { LocaleInfoArray, SettingsState, } from "./types";

const log = rootLog.child({ module: "settings", },);

export function general(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
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
          const fields = [
            "displayName",
            "birthDate",
            "theme",
            "locale",
            "provider",
            "apiEndpoint",
            "model",
            "maxTokens",
            "detailLevel",
          ] as const;
          for (const key of fields) {
            if (settings[key]) { (this as unknown as Record<string, unknown>)[key] = settings[key]; }
          }
          if (typeof settings.temperature === "number") { this.temperature = settings.temperature; }
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
              accessStatus: typeof d.accessStatus === "string" ? d.accessStatus : "clear",
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
      if (this.nsfwConsent.accessStatus === "blocked") { parts.push(t("settings.nsfwBlocked",),); }
      if (this.nsfwConsent.accessStatus === "banned") { parts.push(t("settings.nsfwBanned",),); }
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

    async exportAllData() {
      try {
        const res = await apiFetch("/api/settings/export",);
        if (!res.ok) {
          showToast("error", t("toasts.exportFailed",),);
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
        showToast("success", t("toasts.exportDownloaded",),);
        setTimeout(() => URL.revokeObjectURL(url,), 1000,);
      } catch (error) {
        log.warn("exportAllData failed", { error: String(error,), },);
        showToast("error", t("toasts.exportFailed",),);
      }
    },

    onConfirmDeleteInput() {
      const btn = document.querySelector("#delete-all-btn",) as HTMLButtonElement | null;
      if (btn) { btn.disabled = this.confirmDeleteText !== "DELETE"; }
    },

    async deleteAllData() {
      if (this.confirmDeleteText !== "DELETE") { return; }
      if (!confirm("This will permanently delete ALL your data. Continue?",)) { return; }
      try {
        const res = await apiFetch("/api/v1/users/me", { method: "DELETE", },);
        if (!res.ok) { throw new Error("Delete failed",); }
      } catch (error) {
        log.warn("deleteAllData failed", { error: String(error,), },);
      }
    },
  };
}
