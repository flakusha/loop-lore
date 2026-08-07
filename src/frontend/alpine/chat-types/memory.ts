// ── Memory Types ───────────────────────────────────────────────
export interface MemoryEntry {
  id: string;
  content: string;
  type: "episodic" | "semantic" | "procedural";
  category?: string;
  confidence: number;
  importance: number;
  keywords: string[];
  sourceMessageId?: string;
  createdAt: string;
  expiresAt?: string;
  pinned?: boolean;
  tokenCount?: number;
}

export interface MemoryPanelState {
  activeTab: "character" | "assistant" | "world";
  characterMemories: MemoryEntry[];
  assistantMemories: MemoryEntry[];
  worldMemories: MemoryEntry[];
  searchQuery: string;
  loading: boolean;
  tokenBudget: number;
  tokensUsed: number;
  showCreateForm: boolean;
  newMemoryContent: string;
}
