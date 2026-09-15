// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory system types.
 *
 * Three memory scopes: character (per-actor), assistant (per-user), world (per-world).
 * Each memory has content, type, confidence, importance, and optional metadata.
 */

import type { Config, } from "../config/schema";
import type { ExtractionKind, MemoryType, } from "../db/enums-story";

/** Memory scope determines ownership and injection target. */
export type MemoryScope = "character" | "assistant" | "world";

/** Memory privacy level — controls who can see this memory. */
export type MemoryPrivacy = "public" | "shared" | "private" | "secret";

/**
 * Extended injection privacy levels.
 * Maps to base MemoryPrivacy for provision pipeline compatibility.
 */
export type InjectionPrivacyLevel =
  | "absolute"
  | "isolated"
  | "localized"
  | "contextual"
  | "shared"
  | "public"
  | "private"
  | "secret";

/**
 * Shareability configuration for a memory.
 * Controls how likely a character is to reveal this memory in conversation.
 */
export interface MemoryShareability {
  /** Base probability of sharing (0-1). Modified by relationship/trust. */
  shareProbability: number;
  /** Characters this memory can ALWAYS be shared with (bypasses probability). */
  trustedActorIds: string[];
  /** Characters this memory can NEVER be shared with. */
  blockedActorIds: string[];
}

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
  /** Full chain of source message IDs bound at extraction (plural; backfilled from legacy single). */
  sourceMessageIds?: string[];
  /** Chat IDs the source chain spans (carry-forward / side chats feeding main). */
  sourceChatIds?: string[];
  /** How the memory was formed (single_response | burst | compaction | manual | carry_forward). */
  extractionKind?: ExtractionKind;
  /** Game-time bounds of the source span (timescape-aware decay, future use). */
  contextWindowStart?: string;
  /** Game-time bounds of the source span (timescape-aware decay, future use). */
  contextWindowEnd?: string;
  pinned: boolean;
  scope: MemoryScope;
  /** Privacy level — controls visibility in group chats and to other characters. */
  privacy: MemoryPrivacy;
  /** Shareability config — JSON-encoded, controls who this memory can be revealed to. */
  shareability: string | null;
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
  actorId: string;
  chatId: string;
  messageId: string;
  /** The AI-generated response content to extract memories from. */
  aiContent: string;
  /** The user message that triggered the generation. */
  userContent?: string;
  /** Full chain of source message IDs to bind (defaults to [messageId]). */
  sourceMessageIds?: string[];
  /** Chat IDs the source chain spans (defaults to [chatId]). */
  sourceChatIds?: string[];
  /** How the memory was formed (defaults to "single_response"). */
  extractionKind?: ExtractionKind;
  /** Force the review workflow: "review" stores pending, "auto" commits. Unset resolves from the user's detailLevel setting. */
  reviewMode?: "review" | "auto";
  /** App config — used to resolve the auxiliary model role for extraction. */
  config: Config;
  /** User ID for BYO apiKey resolution on the auxiliary call. */
  userId?: string;
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
  /** Minimum strength to survive purge (strength decays over time). */
  minStrength: number;
}
