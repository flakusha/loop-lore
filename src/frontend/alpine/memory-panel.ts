/**
 * Memory Panel Component
 *
 * Phase 1 Foundation: Memory display, search, create.
 * No backend wiring — uses mock data for UI development.
 */

import type { ChatState, MemoryEntry } from "./types";

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

  async loadMemories() {
    // Phase 1: Mock data for UI development
    // TODO: Replace with actual API call when backend is ready
    this.memoryPanel.characterMemories = [
      {
        id: "mem_1",
        content: "The old lighthouse keeper mentioned strange lights in the marsh.",
        type: "episodic",
        category: "lore",
        confidence: 0.9,
        importance: 5,
        keywords: ["lighthouse", "marsh", "lights"],
        createdAt: new Date().toISOString(),
        tokenCount: 15,
      },
    ];

    this.memoryPanel.assistantMemories = [
      {
        id: "mem_2",
        content: "User prefers concise narrative responses.",
        type: "procedural",
        category: "preference",
        confidence: 0.8,
        importance: 3,
        keywords: ["user", "preference", "concise"],
        createdAt: new Date().toISOString(),
        tokenCount: 10,
      },
    ];

    this.memoryPanel.worldMemories = [
      {
        id: "mem_3",
        content: "The kingdom of Eldoria has been at peace for 50 years.",
        type: "semantic",
        category: "history",
        confidence: 1,
        importance: 8,
        keywords: ["Eldoria", "kingdom", "peace"],
        createdAt: new Date().toISOString(),
        tokenCount: 12,
      },
    ];

    // Update token count inline
    const allMemories = [
      ...this.memoryPanel.characterMemories,
      ...this.memoryPanel.assistantMemories,
      ...this.memoryPanel.worldMemories,
    ];
    this.memoryPanel.tokensUsed = allMemories.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
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

    if (!query) return memories;

    return memories.filter(
      (m) =>
        m.content.toLowerCase().includes(query) ||
        m.keywords.some((k) => k.toLowerCase().includes(query)) ||
        m.category?.toLowerCase().includes(query),
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
    // Method for triggering reactivity on search input
  },

  async createMemory() {
    if (!this.memoryPanel.newMemoryContent.trim()) return;

    const newMemory: MemoryEntry = {
      id: `mem_${Date.now()}`,
      content: this.memoryPanel.newMemoryContent.trim(),
      type: "episodic",
      category: "manual",
      confidence: 1,
      importance: 5,
      keywords: [],
      createdAt: new Date().toISOString(),
      tokenCount: Math.ceil(this.memoryPanel.newMemoryContent.length / 4),
    };

    this.getCurrentMemoryList().unshift(newMemory);
    this.memoryPanel.newMemoryContent = "";
    this.memoryPanel.showCreateForm = false;

    // Update token count inline
    const allMemories = [
      ...this.memoryPanel.characterMemories,
      ...this.memoryPanel.assistantMemories,
      ...this.memoryPanel.worldMemories,
    ];
    this.memoryPanel.tokensUsed = allMemories.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
  },

  async deleteMemory(memoryId: string) {
    const memories = this.getCurrentMemoryList();
    const idx = memories.findIndex((m) => m.id === memoryId);
    if (idx !== -1) {
      memories.splice(idx, 1);
      // Update token count inline
      const allMemories = [
        ...this.memoryPanel.characterMemories,
        ...this.memoryPanel.assistantMemories,
        ...this.memoryPanel.worldMemories,
      ];
      this.memoryPanel.tokensUsed = allMemories.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
    }
  },

  async toggleMemoryPin(memoryId: string) {
    const memories = this.getCurrentMemoryList();
    const mem = memories.find((m) => m.id === memoryId);
    if (mem) {
      mem.pinned = !mem.pinned;
    }
  },

  updateMemoryTokenCount() {
    const allMemories = [
      ...this.memoryPanel.characterMemories,
      ...this.memoryPanel.assistantMemories,
      ...this.memoryPanel.worldMemories,
    ];
    this.memoryPanel.tokensUsed = allMemories.reduce((sum, m) => sum + (m.tokenCount || 0), 0);
  },
};
