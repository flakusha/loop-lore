// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/frontend/alpine/omni-search.ts
//
// Omni-search page (`/views/search`): one debounced query fans out to the
// unified /api/search route and renders results grouped by surface
// (chats, messages, assets). Permission gating stays server-side — the
// route inherits each surface's visibility rules.

import { t, } from "./i18n";
import { jsonParseOr, } from "./json";
import type { OmniSearchResults, OmniSearchState, } from "./types";

const EMPTY_RESULTS: OmniSearchResults = { chats: [], messages: [], assets: [], };

globalThis.omniSearch = function(): OmniSearchState {
  // Monotonic request id: a slow earlier response must never overwrite a
  // newer one (typing fast past a long query).
  let requestSeq = 0;

  return {
    q: "",
    loading: false,
    error: false,
    queried: "",
    results: { ...EMPTY_RESULTS, },

    /**
     * Total hit count across the three surfaces (drives the empty state).
     * @returns {number}
     */
    total() {
      return this.results.chats.length + this.results.messages.length + this.results.assets.length;
    },

    /**
     * Empty-state heading with the failed query interpolated.
     * @returns {string}
     */
    noResultsLabel() {
      return t("search.noResults", { query: this.queried, },);
    },

    /**
     * Run the unified search for the current input (debounced by the view).
     * @returns {Promise<void>}
     */
    async run() {
      const q = this.q.trim();
      const seq = requestSeq + 1;
      requestSeq = seq;

      if (q === "") {
        this.loading = false;
        this.error = false;
        this.queried = "";
        this.results = { ...EMPTY_RESULTS, };
        return;
      }

      this.loading = true;
      this.error = false;
      try {
        const res = await apiFetch(`/api/v1/search?q=${encodeURIComponent(q,)}`,);
        if (seq !== requestSeq) { return; }
        if (!res.ok) { throw new Error(`omni search failed: ${String(res.status,)}`,); }
        const data = jsonParseOr<Partial<OmniSearchResults>>(await res.text(), EMPTY_RESULTS,);
        this.queried = q;
        this.results = {
          chats: data.chats ?? [],
          messages: data.messages ?? [],
          assets: data.assets ?? [],
        };
      } catch {
        if (seq !== requestSeq) { return; }
        this.error = true;
        this.queried = "";
        this.results = { ...EMPTY_RESULTS, };
      } finally {
        if (seq === requestSeq) { this.loading = false; }
      }
    },

    /**
     * Open the chat a chat or message hit points at.
     * @param chatId
     */
    openChat(chatId: string,) {
      globalThis.location.assign(`/chat/${chatId}`,);
    },

    /**
     * Open the centered asset preview for an asset hit.
     * @param assetId
     */
    openAsset(assetId: string,) {
      void openAssetPreview(assetId,);
    },
  };
};
