// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { SettingsState, } from "./types";

const log = rootLog.child({ module: "settings", },);

/** */
export function api(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
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
        const res = await apiFetch("/api/v1/users/me/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonBody(payload,),
        },);
        if (res.ok && payload.displayName) {
          await apiFetch("/api/v1/users/me", {
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
  };
}
