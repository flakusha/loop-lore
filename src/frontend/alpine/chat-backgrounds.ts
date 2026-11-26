// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Chat backgrounds (location sync) — panel ─────────────────
//
// Shows the chat's current background and lets the user pick from the
// background catalog. The backend auto-syncs the background whenever the
// chat's `current_location_id` changes (location→background resolution), so
// calling loadBackground() after a location change reflects the switch.
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-backgrounds", },);

/** Types the backend knows (src/routes/chat-backgrounds/shared.ts); anything else falls back to static styling. */
const KNOWN_BACKGROUND_TYPES: Record<string, true> = {
  static: true,
  animated: true,
  parallax: true,
  particle: true,
  video: true,
};

/** */
export interface ChatBackgroundRow {
  id: string;
  name: string;
  type: string;
  location_id: string | null;
  asset_id: string | null;
  config: string | null;
  priority: number;
}

export const chatBackgrounds:
  & Partial<ChatState>
  & ThisType<ChatState>
  & { backgroundType(): string | null } = {
    _background: null as ChatBackgroundRow | null,
    _backgrounds: [] as ChatBackgroundRow[],
    _backgroundsLoading: false,
    _backgroundsOpen: false,

    /**
     * Raw-asset URL for the chat's current background. Derived from reactive
     * `_background`, so Alpine re-evaluates bindings when a background is
     * loaded, changed, or cleared.
     * @returns {string | null}
     */
    backgroundImageUrl() {
      const assetId = this._background?.asset_id ?? null;
      return assetId ? `/api/v1/assets/${assetId}/raw` : null;
    },

    /**
     * Whitelisted type for the backdrop's data attribute. Unknown types and
     * unassigned backgrounds return null so Alpine omits the attribute and
     * CSS falls back to the static treatment.
     * @returns {string | null}
     */
    backgroundType() {
      const type = this._background?.type;
      return type && KNOWN_BACKGROUND_TYPES[type] ? type : null;
    },

    /**
     * @returns {void}
     */
    toggleBackgroundPanel() {
      this._backgroundsOpen = !this._backgroundsOpen;
      if (this._backgroundsOpen && this.activeChat) {
        this.loadBackgrounds();
      }
    },

    /**
     * @returns {Promise<void>}
     */
    async loadBackground() {
      if (!this.activeChat) { return; }
      try {
        const res = await apiFetch(`/api/v1/chats/${this.activeChat}/background`,);
        if (!res.ok) { return; }
        const body = await res.json();
        this._background = (body.data as ChatBackgroundRow | null) ?? null;
      } catch (error) {
        log.warn("loadBackground failed", { error: String(error,), },);
      }
    },

    /**
     * @returns {Promise<void>}
     */
    async loadBackgrounds() {
      if (!this.activeChat) { return; }
      this._backgroundsLoading = true;
      try {
        const res = await apiFetch("/api/v1/backgrounds",);
        if (res.ok) {
          // Load the chat's assignment as well so a stale cached background is
          // refreshed (important after a location change auto-sync).
          const body = await res.json();
          this._backgrounds = (body.data as ChatBackgroundRow[]) || [];
        }

        await this.loadBackground();
      } catch (error) {
        log.warn("loadBackgrounds failed", { error: String(error,), },);
      }

      this._backgroundsLoading = false;
    },

    /**
     * @param {string} backgroundId
     * @returns {Promise<void>}
     */
    async setBackground(backgroundId: string,) {
      if (!this.activeChat) { return; }
      try {
        const res = await apiFetch(`/api/v1/chats/${this.activeChat}/background`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ backgroundId, },),
        },);

        if (res.ok) {
          const body = await res.json();
          this._background = (body.data as ChatBackgroundRow | null) ?? null;
        }
      } catch (error) {
        log.warn("setBackground failed", { error: String(error,), },);
      }
    },

    /**
     * @returns {Promise<void>}
     */
    async removeBackground() {
      if (!this.activeChat) { return; }
      try {
        const res = await apiFetch(`/api/v1/chats/${this.activeChat}/background`, { method: "DELETE", },);
        if (res.ok) { this._background = null; }
      } catch (error) {
        log.warn("removeBackground failed", { error: String(error,), },);
      }
    },
  };
