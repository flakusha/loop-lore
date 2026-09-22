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
import { jsonStringifyOr, } from "../../../utils/safe-json";
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
  /** How the memory was formed; surfaced in panel for audit traceability. */
  extraction_kind?: string;
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
    extractionKind: row.extraction_kind,
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

/** Raw audit row as returned by GET /api/v1/actors/:id/memories/audit. */
export interface AuditApiRow {
  id: string;
  memoryId: string;
  actorId: string;
  userId: string | null;
  action: AuditAction;
  details: Record<string, unknown>;
  createdAt: string;
}

/** Page wrapper returned by the audit endpoint. */
export interface AuditApiPage {
  entries: AuditApiRow[];
  nextCursor?: string | null;
}

/** Map a raw API row to the panel AuditEntry shape. */
export function toAuditEntry(row: AuditApiRow,): AuditEntry {
  return {
    id: row.id,
    memoryId: row.memoryId,
    actorId: row.actorId,
    userId: row.userId,
    action: row.action,
    details: jsonStringifyOr(row.details ?? {},),
    createdAt: row.createdAt,
  };
}

/** All known audit actions — order matches the audit tab's filter chip row. */
export const AUDIT_ACTIONS: AuditAction[] = ["create", "modify", "pin", "unpin", "decay", "purge", "inject", "delete",];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: "Created",
  modify: "Modified",
  pin: "Pinned",
  unpin: "Unpinned",
  decay: "Decayed",
  purge: "Purged",
  inject: "Injected",
  delete: "Deleted",
};

export const AUDIT_ACTION_ICONS: Record<AuditAction, string> = {
  create: "\u271A",
  modify: "\u270F\uFE0F",
  pin: "\uD83C\uDCCC",
  unpin: "\uD83D\uDEAB",
  decay: "\u23F3",
  purge: "\uD83D\uDDD1",
  inject: "\uD83D\uDC89",
  delete: "\uD83D\uDDD1",
};

export function auditActionLabel(action: AuditAction,): string {
  return AUDIT_ACTION_LABELS[action];
}

export function auditActionIcon(action: AuditAction,): string {
  return AUDIT_ACTION_ICONS[action];
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
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },);
}

/**
 * Parse an audit entry's `details` JSON. Returns `{}` for malformed input.
 * @param details
 */
export function parseAuditDetails(details: string,): Record<string, unknown> {
  if (!details) { return {}; }
  const obj = jsonParseOr<unknown>(details, {},);
  if (obj && typeof obj === "object" && !Array.isArray(obj,)) {
    return obj as Record<string, unknown>;
  }
  return {};
}

/**
 * Filter audit entries by the panel's current action filter.
 * @param entries
 * @param filter
 */
export function auditEntriesForFilter(entries: AuditEntry[], filter: AuditAction | null,): AuditEntry[] {
  if (!filter) { return entries; }
  return entries.filter((e,) => e.action === filter);
}

/**
 * Resolve the distinct extraction kinds present in an `inject` audit
 * entry by looking each `memoryId` up across the loaded memory tabs.
 * Returns an empty array for non-inject actions, when the audit
 * payload has no `memoryIds`, or when the referenced memories have
 * not been loaded yet (the audit tab is paginated independently).
 * @param entry
 * @param panel
 */
export function injectAuditKinds(entry: AuditEntry, panel: MemoryPanelState,): string[] {
  if (entry.action !== "inject") { return []; }
  const details = parseAuditDetails(entry.details,);
  const ids = Array.isArray(details.memoryIds,)
    ? (details.memoryIds as unknown[]).filter((id,): id is string => typeof id === "string")
    : [];
  if (ids.length === 0) { return []; }
  const byId = new Map<string, MemoryEntry>();
  for (const list of [panel.characterMemories, panel.assistantMemories, panel.worldMemories,]) {
    for (const m of list) { byId.set(m.id, m,); }
  }
  const seen = new Set<string>();
  for (const id of ids) {
    const mem = byId.get(id,);
    if (mem?.extractionKind) { seen.add(mem.extractionKind,); }
  }
  return [...seen,];
}
