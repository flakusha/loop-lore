// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Chat list filters (sidebar panel) ─────────────────────
//
// Holds the chat-list filter controls (type / status / sort) and turns them
// into server-side query params for GET /api/v1/chats. It deliberately does NOT
// own the fetch — it exposes applyChatFilters() which reuses the existing
// loadChats() on ChatState (merged query params via _filterParams()).
//
// Archive state is encoded in `chats.is_pinned` (PinnedState enum) on the
// backend, so "active" maps to archived=false there.
//
// Filter state persists in localStorage under `chat-sidebar-filters`
// (TASK-chat-room-filters): restoreChatFilters() runs before the first
// loadChats(), applyChatFilters() persists on every change. Active filters
// surface as removable chips (activeChatFilterChips + clearChatFilter /
// clearAllChatFilters).
import type { ChatState, } from "./types";

const STORAGE_KEY = "chat-sidebar-filters";

/** Serializable filter state (public names, no underscore prefix). */
interface StoredFilters {
  type?: string;
  status?: string;
  sort?: string;
  world?: string;
  minMessages?: string;
  maxMessages?: string;
  updatedSince?: string;
}

const FILTER_DEFAULTS = {
  _chatType: "all",
  _chatStatus: "all",
  _chatSort: "recent",
  _chatWorld: "",
  _chatMinMessages: "",
  _chatMaxMessages: "",
  _chatUpdatedSince: "",
} as const;

/** Chat-list filter chip keys (subset of StoredFilters with non-empty defaults). */
export type ChatFilterChipKey = keyof StoredFilters;

/** Read the persisted filter blob, tolerating corrupt/stale storage. */
function readStoredFilters(): StoredFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY,);
    if (!raw) { return {}; }
    const parsed: unknown = JSON.parse(raw,);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed,)) { return {}; }
    return parsed as StoredFilters;
  } catch {
    return {};
  }
}

export const chatFilters: Partial<ChatState> & ThisType<ChatState> = {
  _chatType: "all",
  _chatStatus: "all",
  _chatSort: "recent",
  _chatWorld: "",
  _chatMinMessages: "",
  _chatMaxMessages: "",
  _chatUpdatedSince: "",

  /** Restore persisted filters from localStorage (no-op without storage). */
  restoreChatFilters(): void {
    let store: Storage | null = null;
    try {
      store = typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      store = null;
    }
    if (!store) { return; }
    const stored = readStoredFilters();
    if (stored.type === "direct" || stored.type === "group") { this._chatType = stored.type; }
    if (stored.status === "active" || stored.status === "archived") { this._chatStatus = stored.status; }
    if (stored.sort === "name" || stored.sort === "unread" || stored.sort === "pinned-first") {
      this._chatSort = stored.sort;
    }
    if (typeof stored.world === "string") { this._chatWorld = stored.world; }
    if (typeof stored.minMessages === "string") { this._chatMinMessages = stored.minMessages; }
    if (typeof stored.maxMessages === "string") { this._chatMaxMessages = stored.maxMessages; }
    if (typeof stored.updatedSince === "string") { this._chatUpdatedSince = stored.updatedSince; }
  },

  /** Persist the current filters to localStorage (no-op without storage). */
  persistChatFilters(): void {
    let store: Storage | null = null;
    try {
      store = typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      store = null;
    }
    if (!store) { return; }
    const payload: StoredFilters = {};
    if (this._chatType !== "all") { payload.type = this._chatType; }
    if (this._chatStatus !== "all") { payload.status = this._chatStatus; }
    if (this._chatSort !== "recent") { payload.sort = this._chatSort; }
    if (this._chatWorld) { payload.world = this._chatWorld; }
    if (this._chatMinMessages) { payload.minMessages = this._chatMinMessages; }
    if (this._chatMaxMessages) { payload.maxMessages = this._chatMaxMessages; }
    if (this._chatUpdatedSince) { payload.updatedSince = this._chatUpdatedSince; }
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(payload,),);
    } catch {
      // Quota/privacy-mode failures must never break filtering.
    }
  },

  /** Serialize the active filters (plus pagination) into /api/v1/chats query params. */
  _filterParams(): string {
    const params = new URLSearchParams();
    params.set("pageSize", "200",);
    if (this._chatType && this._chatType !== "all") { params.set("type", this._chatType,); }
    if (this._chatStatus === "active") { params.set("archived", "false",); }
    if (this._chatStatus === "archived") { params.set("archived", "true",); }
    if (this._chatSort && this._chatSort !== "recent") { params.set("sort", this._chatSort,); }
    if (this._chatWorld) { params.set("world", this._chatWorld,); }
    if (this._chatMinMessages) { params.set("minMessages", this._chatMinMessages,); }
    if (this._chatMaxMessages) { params.set("maxMessages", this._chatMaxMessages,); }
    if (this._chatUpdatedSince) { params.set("updatedSince", this._chatUpdatedSince,); }
    return params.toString();
  },

  /** Active filters as removable chips (world resolves to its display name). */
  activeChatFilterChips(): { key: ChatFilterChipKey; label: string }[] {
    const chips: { key: ChatFilterChipKey; label: string }[] = [];
    if (this._chatType !== "all") { chips.push({ key: "type", label: this._chatType, },); }
    if (this._chatStatus !== "all") { chips.push({ key: "status", label: this._chatStatus, },); }
    if (this._chatSort !== "recent") { chips.push({ key: "sort", label: this._chatSort, },); }
    if (this._chatWorld) {
      const world = (this._worlds ?? []).find((w,) => w.id === this._chatWorld);
      chips.push({ key: "world", label: world?.name ?? this._chatWorld, },);
    }
    if (this._chatMinMessages) { chips.push({ key: "minMessages", label: `≥ ${this._chatMinMessages} msgs`, },); }
    if (this._chatMaxMessages) { chips.push({ key: "maxMessages", label: `≤ ${this._chatMaxMessages} msgs`, },); }
    if (this._chatUpdatedSince) { chips.push({ key: "updatedSince", label: `since ${this._chatUpdatedSince}`, },); }
    return chips;
  },

  /** Remove one filter chip (reset to default) and refresh the list. */
  async clearChatFilter(key: ChatFilterChipKey,): Promise<void> {
    switch (key) {
      case "type": {
        this._chatType = "all";
        break;
      }
      case "status": {
        this._chatStatus = "all";
        break;
      }
      case "sort": {
        this._chatSort = "recent";
        break;
      }
      case "world": {
        this._chatWorld = "";
        break;
      }
      case "minMessages": {
        this._chatMinMessages = "";
        break;
      }
      case "maxMessages": {
        this._chatMaxMessages = "";
        break;
      }
      case "updatedSince": {
        this._chatUpdatedSince = "";
        break;
      }
    }
    await this.applyChatFilters();
  },

  /** Reset every filter to its default and refresh the list. */
  async clearAllChatFilters(): Promise<void> {
    this._chatType = FILTER_DEFAULTS._chatType;
    this._chatStatus = FILTER_DEFAULTS._chatStatus;
    this._chatSort = FILTER_DEFAULTS._chatSort;
    this._chatWorld = FILTER_DEFAULTS._chatWorld;
    this._chatMinMessages = FILTER_DEFAULTS._chatMinMessages;
    this._chatMaxMessages = FILTER_DEFAULTS._chatMaxMessages;
    this._chatUpdatedSince = FILTER_DEFAULTS._chatUpdatedSince;
    await this.applyChatFilters();
  },

  /** Called from the filter controls: re-fetches the chat list with active filters. */
  async applyChatFilters() {
    // Switching server-side filters supersedes any in-progress text search.
    this._searchResults = [];
    this.persistChatFilters();
    await this.loadChats();
  },
};
