// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory Panel Component
 *
 * Wires the memory panel UI to the backend CRUD API at /api/actors/:id/memories.
 * Loads character memories from the active chat's actor participants.
 */

import { jsonBody, } from "./json";
import { memoriesForTab, type MemoryApiRow, toMemoryEntry, } from "./memory-panel/transform";
import type { ChatState, MemoryEntry, } from "./types";

export const memoryPanel: Partial<ChatState> & ThisType<ChatState> = {
  memoryPanel: {
    activeTab: "character",
    characterMemories: [],
    assistantMemories: [],
    worldMemories: [],
    searchQuery: "",
    loading: false,
    tokenBudget: 1024,
    tokensUsed: 0,
    showCreateForm: false,
    newMemoryContent: "",
  },

  /**
   * Get the character actor ID from chat participants.
   * In a character chat, the first non-user participant is the character.
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

      const res = await apiFetch(`/api/actors/${actorId}/memories`,);
      if (!res.ok) { return; }
      const data = await res.json() as { items?: MemoryApiRow[] };

      const characterMemories: MemoryEntry[] = [];
      const assistantMemories: MemoryEntry[] = [];
      const worldMemories: MemoryEntry[] = [];
      const items = data.items ?? [];
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
      const res = await apiFetch(`/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          content: this.memoryPanel.newMemoryContent.trim(),
          memoryType: "episodic",
          confidence: 1,
          importance: 5,
          keywords: [],
          scope: this.memoryPanel.activeTab,
        },),
      },);
      if (!res.ok) { return; }
      const created = await res.json() as MemoryApiRow;

      const newMemory = toMemoryEntry(created, this.memoryPanel.activeTab,);
      this.getCurrentMemoryList().unshift(newMemory,);
      this.memoryPanel.newMemoryContent = "";
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
      await apiFetch(`/api/actors/${actorId}/memories/${memoryId}`, {
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
      await apiFetch(`/api/actors/${actorId}/memories/${memoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ pinned: mem.pinned, },),
      },);
    } catch {
      // Revert on failure
      mem.pinned = !mem.pinned;
    }
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
};
