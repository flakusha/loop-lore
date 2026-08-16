// ── Chat list filters (sidebar panel) ─────────────────────
//
// Holds the chat-list filter controls (type / status / sort) and turns them
// into server-side query params for GET /api/v1/chats. It deliberately does NOT
// own the fetch — it exposes applyChatFilters() which reuses the existing
// loadChats() on ChatState (merged query params via _filterParams()).
//
// Archive state is encoded in `chats.is_pinned` (PinnedState enum) on the
// backend, so "active" maps to archived=false there.
import type { ChatState, } from "./types";

export const chatFilters: Partial<ChatState> & ThisType<ChatState> = {
  _chatType: "all",
  _chatStatus: "all",
  _chatSort: "recent",
  _chatWorld: "",
  _chatMinMessages: "",
  _chatMaxMessages: "",
  _chatUpdatedSince: "",

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

  /** Called from the filter controls: re-fetches the chat list with active filters. */
  async applyChatFilters() {
    // Switching server-side filters supersedes any in-progress text search.
    this._searchResults = [];
    await this.loadChats();
  },
};
