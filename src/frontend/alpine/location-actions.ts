// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quick-actions mixin for the world page location details panel
 * (TASK-location-details). There is no direct chat-page URL in this app
 * (chats open through the character SPA), so "talk at a location" is the
 * real flow the platform supports: move one of your chats to the location
 * (PUT /chats/:id/location) — the same call the chat UI's manual move uses.
 * The other actions route to existing surfaces: trade = the location's
 * items-available list, explore = the world editor's explore tab. None of
 * these mutate world state beyond the documented chat move.
 */
import { jsonBody, } from "./json";
import { fetchWorldJson, } from "./world-fetch";
import type { WorldChatLite, WorldPageState, } from "./world-types";

/** Chat list + move action for the world page. */
export const locationActions: Partial<WorldPageState> & ThisType<WorldPageState> = {
  worldChats: [],
  chatsLoading: false,

  /** @returns {Promise<void>} */
  async loadWorldChats() {
    this.chatsLoading = true;
    try {
      const body = await fetchWorldJson<{ data?: WorldChatLite[] }>(this.worldId, "/chats",);
      if (body) { this.worldChats = Array.isArray(body.data,) ? body.data : []; }
    } finally {
      this.chatsLoading = false;
    }
  },

  /**
   * @param {string | null} locationId location to filter by (null = unbound)
   * @returns {WorldChatLite[]}
   */
  chatsAt(locationId: string | null,): WorldChatLite[] {
    return this.worldChats.filter((c,) => c.current_location_id === locationId);
  },

  /**
   * Move one of the user's world chats to a location (the platform's
   * "talk/travel there" action). Toasts on success/failure and refreshes
   * the cached chat list.
   * @param {string} chatId chat to move
   * @param {string} locationId destination location
   * @returns {Promise<void>}
   */
  async moveChatTo(chatId: string, locationId: string,) {
    this.travelBusy = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/location`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ locationId, },),
      },);

      if (res.ok) {
        showToast("success", "Chat moved",);
        await this.loadWorldChats();
        await this.loadTravelStatus();
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showToast("error", err.error ?? "Failed to move chat",);
      }
    } catch {
      showToast("error", "Network error",);
    } finally {
      this.travelBusy = false;
    }
  },

  /** @returns {void} */
  navigateExplore() {
    globalThis.location.assign(`/worlds/${this.worldId}/edit`,);
  },
};
