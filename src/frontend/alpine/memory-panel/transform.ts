// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory-panel data transforms.
 *
 * Pure helpers shared by the memory panel component: API-row → MemoryEntry
 * mapping, keyword parsing and tab-scoped memory selection. Kept out of
 * `memory-panel.ts` so the component stays under the 250L file-size guard.
 */

import { jsonParseOr, } from "../json";
import type { MemoryEntry, MemoryPanelState, } from "../types";

/**
 * Estimate tokens from content length (~4 chars per token).
 * @param content
 */
export function estimateTokens(content: string,): number {
  return Math.ceil(content.length / 4,);
}

/** Raw memory row as returned by the actors/memories CRUD API. */
export interface MemoryApiRow {
  id: string;
  content: string;
  memory_type: string;
  confidence: number;
  importance: number;
  keywords: string | string[];
  pinned?: boolean;
  scope?: string;
  created_at: string;
}

/**
 * Parse keywords that may arrive as a JSON string or as an array.
 * @param keywords
 */
export function parseMemoryKeywords(keywords: string | string[],): string[] {
  return typeof keywords === "string"
    ? jsonParseOr<string[]>(keywords || "[]", [],)
    : (keywords ?? []);
}

/**
 * Map a raw API row to a MemoryEntry, defaulting the scope when absent.
 * @param row
 * @param scopeFallback
 */
export function toMemoryEntry(row: MemoryApiRow, scopeFallback: MemoryEntry["scope"],): MemoryEntry {
  return {
    id: row.id,
    content: row.content,
    type: row.memory_type as MemoryEntry["type"],
    confidence: row.confidence,
    importance: row.importance,
    keywords: parseMemoryKeywords(row.keywords,),
    pinned: !!row.pinned,
    createdAt: row.created_at,
    tokenCount: estimateTokens(row.content,),
    scope: (row.scope as MemoryEntry["scope"]) ?? scopeFallback,
  };
}

/**
 * Memories owned by the given panel tab.
 * @param panel
 * @param tab
 */
export function memoriesForTab(panel: MemoryPanelState, tab: MemoryPanelState["activeTab"],): MemoryEntry[] {
  switch (tab) {
    case "assistant": {
      return panel.assistantMemories;
    }
    case "world": {
      return panel.worldMemories;
    }
    case "character": {
      return panel.characterMemories;
    }
  }
}
