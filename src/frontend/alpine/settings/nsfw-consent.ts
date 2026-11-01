// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW consent settings mixin — consent state, restriction summary, and the
 * blur-media preference save path. Split from general.ts for the 250-line
 * size gate; composed back into the settings state via general().
 */
import { storageSet, } from "../../storage";
import { NSFW_BLUR_STORAGE_KEY, } from "../chat-utils/nsfw-blur";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { SettingsState, } from "./types";

const log = rootLog.child({ module: "settings", },);

/**
 * @returns {Partial<SettingsState> & ThisType<SettingsState>}
 */
export function nsfwConsentSettings(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    /** Fetch the acting user's stored NSFW consent (enabled state, rating, restrictions). */
    /**
     * @returns {Promise<void>}
     */
    async loadNsfwConsent() {
      const userId = __USER_ID as string | undefined;
      if (!userId) { return; }
      try {
        const res = await apiFetch(`/api/v1/nsfw/moderation/preferences/${encodeURIComponent(userId,)}`, {
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
              nsfwBlurMedia: d.nsfwBlurMedia === true,
              blockReason: typeof d.blockReason === "string" ? d.blockReason : null,
            };
          }
        }
      } catch (error) {
        log.warn("loadNsfwConsent failed", { error: String(error,), },);
      }
    },

    /** Human-readable summary of any NSFW access restrictions on this account. */
    /**
     * @returns {string}
     */
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

    /**
     * Persist the NSFW blur preference. The server column
     * (`nsfw_user_preferences.nsfw_blur_media`, via the NSFW preferences API)
     * is the source of truth; the localStorage mirror is what the chat and
     * gallery render paths read (same dual persistence as the chat display
     * flags). Default OFF — the mirror is only written here.
     * @returns {Promise<void>}
     */
    async onNsfwBlurChange() {
      const userId = __USER_ID as string | undefined;
      const value = this.nsfwConsent?.nsfwBlurMedia === true;
      storageSet("local", NSFW_BLUR_STORAGE_KEY, value ? "1" : "0",);
      if (!userId) { return; }
      try {
        const res = await apiFetch(`/api/v1/nsfw/moderation/preferences/${encodeURIComponent(userId,)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonBody({ nsfwBlurMedia: value, },),
        },);

        if (!res.ok) {
          log.warn("nsfw blur preference save failed", { status: res.status, },);
        }
      } catch (error) {
        log.warn("nsfw blur preference save failed", { error: String(error,), },);
      }
    },
  };
}
