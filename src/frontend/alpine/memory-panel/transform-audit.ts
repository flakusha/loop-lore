// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory-panel audit-tab transforms (FEAT-075).
 *
 * API-row → AuditEntry mapping, action label/icon tables, details
 * formatting/parsing, filter selection and inject-kind resolution.
 * Split from transform.ts (pure refactor, no behavior change); the
 * symbols are re-exported there to keep a single import surface.
 */

import { toDate, } from "../../../utils/date";
import { jsonStringifyOr, safeJsonParse, safeJsonStringify, } from "../../../utils/safe-json";
import { jsonParseOr, } from "../json";
import type { AuditAction, AuditEntry, MemoryEntry, MemoryPanelState, } from "../types";

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
  purge: "\uD83E\uDDF9",
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
 * Format an audit entry's `details` JSON for the expanded view
 * (2-space indented). Malformed JSON falls back to the raw string so
 * the operator still sees the payload; empty input renders as "".
 * @param details
 */
export function formatAuditDetails(details: string,): string {
  if (!details.trim()) { return ""; }
  const parsed = safeJsonParse<unknown>(details,);
  if (!parsed.ok) { return details; }
  const reparsed = safeJsonStringify(parsed.value, 2,);
  return reparsed.ok ? reparsed.value : details;
}

/**
 * True when an audit entry's details block offers anything to expand
 * (non-empty payload).
 * @param entry
 */
export function auditDetailsExpandable(entry: AuditEntry,): boolean {
  return entry.details.trim().length > 0;
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
