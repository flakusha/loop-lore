/**
 * Memory system types.
 *
 * Three memory scopes: character (per-actor), assistant (per-user), world (per-world).
 * Each memory has content, type, confidence, importance, and optional metadata.
 */

import type { MemoryType, } from "../db/enums-story";

/** Memory scope determines ownership and injection target. */
export type MemoryScope = "character" | "assistant" | "world";

/** A single memory entry stored in the database. */
export interface MemoryEntry {
  id: string;
  actorId?: string;
  userId?: string;
  worldId?: string;
  content: string;
  memoryType: MemoryType;
  confidence: number;
  importance: number;
  keywords: string[];
  sourceChatId?: string;
  sourceMessageId?: string;
  pinned: boolean;
  scope: MemoryScope;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Result from LLM memory extraction. */
export interface ExtractedMemory {
  content: string;
  memoryType: MemoryType;
  confidence: number;
  importance: number;
  keywords: string[];
}

/** Options for memory extraction after a generation. */
export interface ExtractionOpts {
  db: import("kysely").Kysely<import("../db/schema").DB>;
  actorId: string;
  chatId: string;
  messageId: string;
  /** The AI-generated response content to extract memories from. */
  aiContent: string;
  /** The user message that triggered the generation. */
  userContent?: string;
  /** Model to use for extraction (optional, uses default). */
  modelId?: string;
}

/** Token budget configuration for memories in a prompt. */
export interface MemoryBudgetConfig {
  /** Max tokens allocated for memories (default: 1024). */
  maxTokens: number;
  /** Drop memories below this confidence when over budget. */
  minConfidence: number;
  /** Never drop pinned memories. */
  respectPins: boolean;
}

/** Options for selecting memories to carry forward to a new chat. */
export interface MemorySelectionOpts {
  db: import("kysely").Kysely<import("../db/schema").DB>;
  actorId: string;
  /** If true, include all memories. If false, use selective list. */
  includeAll: boolean;
  /** Specific memory IDs to include (when includeAll is false). */
  memoryIds?: string[];
}

/** Auto-purge configuration. */
export interface PurgeConfig {
  /** Mark memories stale after N chats without reference. */
  staleAfterChats: number;
  /** Actually delete stale memories (vs just hiding them). */
  hardDelete: boolean;
  /** Minimum confidence to survive purge. */
  minConfidence: number;
}
