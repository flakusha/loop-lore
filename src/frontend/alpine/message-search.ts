// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── In-chat message search — highlight + keyboard navigation ──
//
// Adds a search toggle to the chat header (🔍). When opened, a search bar
// queries the FTS-backed GET /api/messages/search endpoint (scoped to the
// active chat), highlights matched message bubbles, shows an "N / M matches"
// counter, and supports Enter/Shift+Enter plus ↑/↓ navigation. Escape closes
// the bar and clears highlights.
//
// Message bubbles carry `data-message-id` (see components/chat/message-list.html);
// highlights are applied by toggling CSS classes on those elements.
import { apiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "message-search", },);

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 50;

/**
 * Message search state + methods, spread into the chat page component
 * (`chatState`) so it can read `this.activeChat`.
 */
export const messageSearch: Partial<ChatState> & ThisType<ChatState> = {
  _msgSearchOpen: false,
  _msgSearchQuery: "",
  _msgSearchMatches: [] as string[],
  _msgSearchTotal: 0,
  _msgSearchIndex: 0,
  _msgSearchLoading: false,
  _msgSearchDebounce: null as ReturnType<typeof setTimeout> | null,

  toggleMessageSearch() {
    this._msgSearchOpen = !this._msgSearchOpen;
    if (this._msgSearchOpen) {
      this._msgSearchMatches = [];
      this._msgSearchTotal = 0;
      this._msgSearchIndex = 0;
      this.applyMessageSearchHighlights();
      this.$nextTick?.(() => {
        const input = this.$refs?.msgSearchInput as HTMLInputElement | undefined;
        input?.focus();
      },);
    } else {
      this.closeMessageSearch();
    }
  },

  onMessageSearchInput() {
    if (this._msgSearchDebounce) { clearTimeout(this._msgSearchDebounce,); }
    this._msgSearchDebounce = setTimeout(() => {
      void this.runMessageSearch();
    }, SEARCH_DEBOUNCE_MS,);
  },

  async runMessageSearch() {
    const chatId = this.activeChat;
    const q = this._msgSearchQuery.trim();
    if (!chatId) { return; }

    if (!q) {
      this._msgSearchMatches = [];
      this._msgSearchTotal = 0;
      this._msgSearchIndex = 0;
      this.applyMessageSearchHighlights();
      return;
    }

    this._msgSearchLoading = true;
    try {
      const url = `/api/messages/search?chatId=${encodeURIComponent(chatId,)}&q=${
        encodeURIComponent(q,)
      }&limit=${SEARCH_LIMIT}`;
      const res = await apiFetch(url,);
      if (!res.ok) {
        this._msgSearchMatches = [];
        this._msgSearchTotal = 0;
        return;
      }
      const body = (await res.json()) as {
        results?: { messageId: string }[];
        total?: number;
      };
      this._msgSearchMatches = Array.from(body.results ?? [], (r,) => r.messageId,);
      this._msgSearchTotal = body.total ?? this._msgSearchMatches.length;
      this._msgSearchIndex = 0;
      this.applyMessageSearchHighlights();
      this.scrollToSearchMatch(0,);
    } catch (error) {
      log.error("Message search failed", error instanceof Error ? error : new Error(String(error,),), { chatId, },);
      this._msgSearchMatches = [];
      this._msgSearchTotal = 0;
    } finally {
      this._msgSearchLoading = false;
    }
  },

  /** Add/remove highlight classes on message bubbles for the current match set. */
  applyMessageSearchHighlights() {
    const scope = this.$refs.messageList ?? document;
    scope.querySelectorAll<HTMLElement>(".search-match-active",).forEach((el,) =>
      el.classList.remove("search-match-active",)
    );
    const matches = this._msgSearchMatches;
    if (matches.length > 0) {
      const selector = Array.from(matches, (id,) => `[data-message-id="${CSS.escape(id,)}"]`,).join(",",);
      scope.querySelectorAll<HTMLElement>(selector,).forEach((el,) => el.classList.add("search-match",));
      this.applySearchMatchActive();
    } else {
      scope.querySelectorAll<HTMLElement>(".search-match",).forEach((el,) => el.classList.remove("search-match",));
    }
  },

  /** Highlight the current match as the active one. */
  applySearchMatchActive() {
    const current = this._msgSearchMatches[this._msgSearchIndex];
    if (!current) { return; }
    const el = this.$refs.messageList?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(current,)}"]`,) ??
      document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(current,)}"]`,);
    el?.classList.add("search-match-active",);
  },

  scrollToSearchMatch(index: number,) {
    const id = this._msgSearchMatches[index];
    if (!id) { return; }
    const el = this.$refs.messageList?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id,)}"]`,) ??
      document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id,)}"]`,);
    el?.scrollIntoView({ behavior: "smooth", block: "center", },);
  },

  nextMessageMatch() {
    if (this._msgSearchMatches.length === 0) { return; }
    this._msgSearchIndex = (this._msgSearchIndex + 1) % this._msgSearchMatches.length;
    this.applySearchMatchActive();
    this.scrollToSearchMatch(this._msgSearchIndex,);
  },

  prevMessageMatch() {
    if (this._msgSearchMatches.length === 0) { return; }
    this._msgSearchIndex = (this._msgSearchIndex - 1 + this._msgSearchMatches.length) % this._msgSearchMatches.length;
    this.applySearchMatchActive();
    this.scrollToSearchMatch(this._msgSearchIndex,);
  },

  /** Enter → next match, Shift+Enter → previous. */
  onMessageSearchEnter(event: KeyboardEvent,) {
    if (event.shiftKey) { this.prevMessageMatch(); }
    else { this.nextMessageMatch(); }
  },

  closeMessageSearch() {
    if (this._msgSearchDebounce) { clearTimeout(this._msgSearchDebounce,); }
    this._msgSearchDebounce = null;
    this._msgSearchOpen = false;
    this._msgSearchQuery = "";
    this._msgSearchMatches = [];
    this._msgSearchTotal = 0;
    this._msgSearchIndex = 0;
    this.applyMessageSearchHighlights();
  },
};

// Expose a global toggle for the chat-header 🔍 button (header lives outside
// the chatState x-data scope). Mirrors chat.ts's toggleGroupPause wiring.
const g = globalThis as Record<string, unknown>;
g.toggleMessageSearch = function() {
  const el = document.querySelector<HTMLElement>("[x-data='chatState()']",);
  if (el && typeof Alpine !== "undefined") {
    const data = Alpine.$data(el,);
    const fn = data.toggleMessageSearch as (() => void) | undefined;
    if (typeof fn === "function") {
      fn();
    }
  }
};
