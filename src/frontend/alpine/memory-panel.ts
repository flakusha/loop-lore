/**
 * Memory Panel Component
 *
 * Wires the memory panel UI to the backend CRUD API at /api/actors/:id/memories.
 * Loads character memories from the active chat's actor participants.
 */

import { jsonBody, jsonParseOr, } from "./json";
import type { ChatState, MemoryEntry, } from "./types";
/** Estimate tokens from content length (~4 chars per token). */
function estimateTokens(content: string,): number {
  return Math.ceil(content.length / 4,);
}

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
        return;
      }

      const res = await fetch(`/api/actors/${actorId}/memories`,);
      if (!res.ok) { return; }
      const data = await res.json() as {
        items: Array<{
          id: string;
          content: string;
          memory_type: string;
          confidence: number;
          importance: number;
          keywords: string | string[];
          source_chat_id?: string;
          pinned?: boolean;
          created_at: string;
        }>;
      };

      this.memoryPanel.characterMemories = (data.items ?? []).map((m,) => ({
        id: m.id,
        content: m.content,
        type: m.memory_type as MemoryEntry["type"],
        confidence: m.confidence,
        importance: m.importance,
        keywords: typeof m.keywords === "string" ? jsonParseOr<string[]>(m.keywords || "[]", [],) : (m.keywords ?? []),
        pinned: !!m.pinned,
        createdAt: m.created_at,
        tokenCount: estimateTokens(m.content,),
      }));

      this._updateTokenCount();
    } catch {
      // Silently fail — memories are non-critical
    } finally {
      this.memoryPanel.loading = false;
    }
  },

  getFilteredMemories(): MemoryEntry[] {
    const query = this.memoryPanel.searchQuery.toLowerCase();

    let memories: MemoryEntry[];
    switch (this.memoryPanel.activeTab) {
      case "character": {
        memories = this.memoryPanel.characterMemories;
        break;
      }
      case "assistant": {
        memories = this.memoryPanel.assistantMemories;
        break;
      }
      case "world": {
        memories = this.memoryPanel.worldMemories;
        break;
      }
      default: {
        memories = [];
      }
    }

    if (!query) { return memories; }

    return memories.filter(
      (m,) =>
        m.content.toLowerCase().includes(query,) ||
        m.keywords.some((k,) => k.toLowerCase().includes(query,)),
    );
  },

  getCurrentMemoryList(): MemoryEntry[] {
    switch (this.memoryPanel.activeTab) {
      case "character": {
        return this.memoryPanel.characterMemories;
      }
      case "assistant": {
        return this.memoryPanel.assistantMemories;
      }
      case "world": {
        return this.memoryPanel.worldMemories;
      }
      default: {
        return [];
      }
    }
  },

  searchMemories() {
    // Triggers Alpine reactivity via x-model
  },

  async createMemory() {
    if (!this.memoryPanel.newMemoryContent.trim()) { return; }

    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }

    try {
      const res = await fetch(`/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          content: this.memoryPanel.newMemoryContent.trim(),
          memoryType: "episodic",
          confidence: 1,
          importance: 5,
          keywords: [],
        },),
      },);
      if (!res.ok) { return; }
      const created = await res.json() as {
        id: string;
        content: string;
        memory_type: string;
        confidence: number;
        importance: number;
        keywords: string | string[];
        created_at: string;
      };

      const newMemory: MemoryEntry = {
        id: created.id,
        content: created.content,
        type: created.memory_type as MemoryEntry["type"],
        confidence: created.confidence,
        importance: created.importance,
        keywords: typeof created.keywords === "string"
          ? jsonParseOr<string[]>(created.keywords || "[]", [],)
          : (created.keywords ?? []),
        createdAt: created.created_at,
        tokenCount: estimateTokens(created.content,),
      };

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
      await fetch(`/api/actors/${actorId}/memories/${memoryId}`, {
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

    const memories = this.getCurrentMemoryList();
    const mem = memories.find((m,) => m.id === memoryId);
    if (!mem) { return; }

    mem.pinned = !mem.pinned;

    try {
      await fetch(`/api/actors/${actorId}/memories/${memoryId}`, {
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
    this.memoryPanel.tokensUsed = allMemories.reduce((sum, m,) => sum + (m.tokenCount || 0), 0,);
  },
};
