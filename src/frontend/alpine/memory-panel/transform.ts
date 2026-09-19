// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory-panel data transforms.
 *
 * Pure helpers shared by the memory panel component: API-row → MemoryEntry
 * mapping, keyword parsing and tab-scoped memory selection. Kept out of
 * `memory-panel.ts` so the component stays under the 250L file-size guard.
 */

import { toDate, } from "../../../utils/date";
import { jsonParseOr, } from "../json";
import type { AuditAction, AuditEntry, MemoryEntry, MemoryPanelState, } from "../types";

/**
 * Estimate tokens from content length (~4 chars per token).
 * @param content
 * @returns estimated token count
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
  source_chat_id?: string;
  review_status?: string;
  created_at: string;
  source_message_ids?: string | string[];
}

/**
 * Parse keywords that may arrive as a JSON string or as an array.
 * @param keywords
 * @returns parsed keyword list
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
 * @returns the mapped panel entry
 */
export function toMemoryEntry(row: MemoryApiRow, scopeFallback: MemoryEntry["scope"],): MemoryEntry {
  const sourceIds = parseMemoryKeywords(row.source_message_ids ?? [],);
  return {
    id: row.id,
    content: row.content,
    type: row.memory_type as MemoryEntry["type"],
    confidence: row.confidence,
    importance: row.importance,
    keywords: parseMemoryKeywords(row.keywords,),
    pinned: !!row.pinned,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    scope: (row.scope as MemoryEntry["scope"]) ?? scopeFallback,
    sourceChatId: row.source_chat_id ?? undefined,
    sourceMessageId: sourceIds[0] ?? undefined,
  };
}

/**
 * Format a memory timestamp for the panel meta row (locale date).
 * @param iso
 * @returns locale date string, empty for an invalid timestamp
 */
export function formatMemoryDate(iso: string,): string {
  const date = toDate(iso,);
  return Number.isNaN(date.getTime(),)
    ? ""
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", },);
}

/**
 * Memories owned by the given panel tab.
 * @param panel
 * @param tab
 * @returns the memories backing that tab
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
    case "audit": {
      return [];
    }
  }
}

// ── Audit transforms (FEAT-075) ─────────────────────────────────

/** Raw audit row as returned by GET /api/actors/:id/memories/audit. */
export interface AuditApiRow {
  id: string;
  memory_id: string;
  actor_id: string;
  user_id: string | null;
  action: string;
  details: string;
  created_at: string;
}

/** Page wrapper returned by the audit endpoint. */
export interface AuditApiPage {
  entries: AuditApiRow[];
  nextCursor?: string | null;
}

/** Map a raw API row to the panel AuditEntry shape. */
export function toAuditEntry(row: AuditApiRow): AuditEntry {
  return {
    id: row.id,
    memoryId: row.memory_id,
    actorId: row.actor_id,
    userId: row.user_id,
    action: row.action as AuditAction,
    details: row.details,
    createdAt: row.created_at,
  };
}

/** All known audit actions — order matches the audit tab's filter chip row. */
export const AUDIT_ACTIONS: AuditAction[] = ["create", "modify", "pin", "unpin", "decay", "purge", "inject", "delete"];

/**
 * Human-readable label for the audit action badge.
 * @param action
 */
export function auditActionLabel(action: AuditAction): string {
  switch (action) {
    case "create": { return "Created"; }
    case "modify": { return "Modified"; }
    case "pin": { return "Pinned"; }
    case "unpin": { return "Unpinned"; }
    case "decay": { return "Decayed"; }
    case "purge": { return "Purged"; }
    case "inject": { return "Injected"; }
    case "delete": { return "Deleted"; }
  }
}

/**
 * Format an audit timestamp for the panel meta row (locale date + time).
 * @param iso
 * @returns locale date+time string, empty for an invalid timestamp
 */
export function formatAuditDate(iso: string,): string {
  const date = toDate(iso,);
  if (Number.isNaN(date.getTime(),)) { return ""; }
  return date.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  },);
}

/**
 * Parse an audit entry's `details` JSON. Returns `{}` for malformed input.
 * @param details
 */
export function parseAuditDetails(details: string,): Record<string, unknown> {
  if (!details) { return {}; }
  const obj = jsonParseOr<Record<string, unknown>>(details, {},);
  return obj ?? {};
}

/**
 * Filter audit entries by the panel's current action filter.
 * @param entries
 * @param filter
 */
export function auditEntriesForFilter(entries: AuditEntry[], filter: AuditAction | null,): AuditEntry[] {
  if (!filter) { return entries; }
  return entries.filter((e,) => e.action === filter,);
}
