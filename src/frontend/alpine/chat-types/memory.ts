// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { MemoryType, } from "../../../db/enums";

// ── Memory Types ───────────────────────────────────────────────
/** */
export interface MemoryEntry {
  id: string;
  content: string;
  type: MemoryType;
  category?: string;
  confidence: number;
  importance: number;
  keywords: string[];
  sourceMessageId?: string;
  /** Chat this row is scoped to (set on carry copies). */
  sourceChatId?: string;
  /** Extraction review workflow state (pending rows await user review). */
  reviewStatus?: string;
  expiresAt?: string;
  pinned?: boolean;
  createdAt?: string;
  tokenCount?: number;
  /** Memory scope — which panel tab owns it (character/assistant/world). */
  scope?: "character" | "assistant" | "world";
}

/** */
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
  /** Memory currently being edited inline (null = none). */
  editingMemoryId: string | null;
  /** Draft content for the memory being edited. */
  editMemoryContent: string;
  /** True while a mutation request is in flight. */
  busy: boolean;
  /** Last panel-level error message (null = none). */
  error: string | null;
}
