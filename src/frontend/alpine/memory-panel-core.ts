// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory panel load/filter/edit actions. Spread into the memory panel
 * component — methods use `this` as ChatState.
 */
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { memoriesForTab, type MemoryApiRow, toMemoryEntry, } from "./memory-panel/transform";
import type { ChatState, MemoryEntry, } from "./types";

/** Max lore-entry keys accepted by the lore-entries route schema. */
const LORE_KEYS_MAX = 5;
/** Max characters for the derived lore-entry name. */
const LORE_NAME_MAX = 48;

/**
 * Draft a character-book lore entry from a memory row.
 * The name prefers the memory's first keyword, else falls back to the first
 * {@linkcode LORE_NAME_MAX} characters of the content (trailing whitespace
 * trimmed); keys are the memory keywords (capped at the route's key limit).
 * @param mem - memory row to promote
 * @returns a create body for `POST /api/v1/actors/:actorId/lore-entries`
 */
export function loreEntryDraftFromMemory(
  mem: Pick<MemoryEntry, "content" | "keywords">,
): { name: string; content: string; keys?: string[] } {
  const content = mem.content.trim();
  const keywords = mem.keywords.map((k,) => k.trim()).filter((k,) => k.length > 0);
  const name = keywords[0] ??
    (content.length > LORE_NAME_MAX ? `${content.slice(0, LORE_NAME_MAX,).trimEnd()}…` : content);

  return {
    name,
    content,
    keys: keywords.length > 0 ? keywords.slice(0, LORE_KEYS_MAX,) : undefined,
  };
}

export const memoryPanelCore: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * Get the character actor ID from chat participants.
   * In a character chat, the first non-user participant is the character.
   * @returns the character actor id, or null when no non-user participant exists
   */
  _getCharacterActorId(): string | null {
    const participants = this._chatParticipants;
    if (!participants || participants.length === 0) { return null; }

    // Find the first participant that is NOT the current user
    const charParticipant = participants.find(
      (p,) => p.actor_id !== this.userRole && p.display_name !== this.userDisplayName,
    );

    return charParticipant?.actor_id ?? null;
  },

  async loadMemories() {
    this.memoryPanel.loading = true;
    try {
      const actorId = this._getCharacterActorId();
      if (!actorId) {
        this.memoryPanel.characterMemories = [];
        this.memoryPanel.assistantMemories = [];
        this.memoryPanel.worldMemories = [];
        return;
      }

      const res = await apiFetch(`/api/v1/actors/${actorId}/memories`,);
      if (!res.ok) { return; }
      const data = await res.json() as { data?: MemoryApiRow[] };

      const characterMemories: MemoryEntry[] = [];
      const assistantMemories: MemoryEntry[] = [];
      const worldMemories: MemoryEntry[] = [];
      const items = data.data ?? [];
      for (const m of items) {
        const entry = toMemoryEntry(m, "character",);
        if (entry.scope === "assistant") {
          assistantMemories.push(entry,);
        } else if (entry.scope === "world") {
          worldMemories.push(entry,);
        } else {
          characterMemories.push(entry,);
        }
      }

      this.memoryPanel.characterMemories = characterMemories;
      this.memoryPanel.assistantMemories = assistantMemories;
      this.memoryPanel.worldMemories = worldMemories;
      this._updateTokenCount();
    } catch {
      // Silently fail — memories are non-critical
    } finally {
      this.memoryPanel.loading = false;
    }
  },

  getFilteredMemories(): MemoryEntry[] {
    const panel = this.memoryPanel;
    const query = panel.searchQuery.toLowerCase();
    const memories = memoriesForTab(panel, panel.activeTab,);
    if (!query) { return memories; }

    const filtered: MemoryEntry[] = [];
    for (const m of memories) {
      if (
        m.content.toLowerCase().includes(query,) ||
        m.keywords.some((k,) => k.toLowerCase().includes(query,))
      ) {
        filtered.push(m,);
      }
    }

    return filtered;
  },

  getCurrentMemoryList(): MemoryEntry[] {
    return memoriesForTab(this.memoryPanel, this.memoryPanel.activeTab,);
  },

  searchMemories() {
    // Triggers Alpine reactivity via x-model
  },

  async createMemory() {
    if (!this.memoryPanel.newMemoryContent.trim()) { return; }

    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }

    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          content: this.memoryPanel.newMemoryContent.trim(),
          memoryType: this.memoryPanel.newMemoryType,
          extractionKind: "manual",
          confidence: 1,
          importance: 5,
          keywords: [],
          scope: this.memoryPanel.activeTab,
        },),
      },);

      if (!res.ok) { return; }
      const created = await res.json() as MemoryApiRow;

      const tab = this.memoryPanel.activeTab === "audit" ? "character" : this.memoryPanel.activeTab;
      const newMemory = toMemoryEntry(created, tab,);
      this.getCurrentMemoryList().unshift(newMemory,);
      this.memoryPanel.newMemoryContent = "";
      this.memoryPanel.newMemoryType = "episodic";
      this.memoryPanel.showCreateForm = false;
      this._updateTokenCount();
    } catch {
      // Silently fail
    }
  },

  async deleteMemory(memoryId: string,) {
    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }

    try {
      await apiFetch(`/api/v1/actors/${actorId}/memories/${memoryId}`, {
        method: "DELETE",
      },);
    } catch {
      // proceed with local removal even if API fails
    }

    const memories = this.getCurrentMemoryList();
    const idx = memories.findIndex((m,) => m.id === memoryId);
    if (idx !== -1) {
      memories.splice(idx, 1,);
      this._updateTokenCount();
    }
  },

  async toggleMemoryPin(memoryId: string,) {
    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }

    const mem = this.getCurrentMemoryList().find((m,) => m.id === memoryId);
    if (!mem) { return; }

    mem.pinned = !mem.pinned;

    try {
      await apiFetch(`/api/v1/actors/${actorId}/memories/${memoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ pinned: mem.pinned, },),
      },);
    } catch {
      // Revert on failure
      mem.pinned = !mem.pinned;
    }
  },

  /** True when the user may write world memories (admin/solo roles). */
  _isWorldAdmin(): boolean {
    return this.userRole === "admin" || this.userRole === "solo";
  },

  /** True when writes are allowed on the active tab (world tab is admin-managed). */
  _canWriteActiveTab(): boolean {
    return this.memoryPanel.activeTab !== "world" || this._isWorldAdmin();
  },

  startEditMemory(mem: MemoryEntry,) {
    if (!this._canWriteActiveTab()) { return; }
    this.memoryPanel.editingMemoryId = mem.id;
    this.memoryPanel.editMemoryContent = mem.content;
  },

  _updateTokenCount() {
    const allMemories = [
      ...this.memoryPanel.characterMemories,
      ...this.memoryPanel.assistantMemories,
      ...this.memoryPanel.worldMemories,
    ];

    let total = 0;
    for (const m of allMemories) { total += m.tokenCount || 0; }
    this.memoryPanel.tokensUsed = total;
  },

  /**
   * One-click promote of a character memory into the character's lorebook
   * (`POST /api/v1/actors/:actorId/lore-entries`, existing route — ownership
   * is enforced server-side). Drafts the entry name/keys from the memory,
   * asks for explicit user confirmation before inserting, and surfaces
   * failures on the shared panel error state. The memory itself is kept.
   * @param mem - the character-scope memory to promote
   * @throws never — failures land in `memoryPanel.error`
   */
  async promoteMemoryToLore(mem: MemoryEntry,) {
    if (this.memoryPanel.activeTab !== "character") { return; }
    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }

    const draft = loreEntryDraftFromMemory(mem,);
    if (!draft.content || !draft.name) { return; }
    if (!confirm(t("chats.promoteToLoreConfirm", { name: draft.name, },),)) { return; }

    this.memoryPanel.busy = true;
    this.memoryPanel.error = null;
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/lore-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ name: draft.name, content: draft.content, keys: draft.keys, },),
      },);

      if (!res.ok) {
        this.memoryPanel.error = t("chats.promoteToLoreFailed",);
      }
    } catch {
      this.memoryPanel.error = t("chats.promoteToLoreFailed",);
    } finally {
      this.memoryPanel.busy = false;
    }
  },
};
