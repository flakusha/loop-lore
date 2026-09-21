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

/** Audit actions recorded in `memory_audit_log.action`. */
export type AuditAction = "create" | "pin" | "unpin" | "modify" | "decay" | "purge" | "inject" | "delete";

/** One row as returned by GET /api/v1/actors/:id/memories/audit. */
export interface AuditEntry {
  id: string;
  memoryId: string;
  actorId: string;
  userId: string | null;
  action: AuditAction;
  /** Freeform JSON serialized to a string by the route. */
  details: string;
  createdAt: string;
}

/** */
export interface MemoryPanelState {
  activeTab: "character" | "assistant" | "world" | "audit";
  characterMemories: MemoryEntry[];
  assistantMemories: MemoryEntry[];
  worldMemories: MemoryEntry[];
  /** Audit log entries (FEAT-075). Loaded lazily when the audit tab is opened. */
  auditEntries: AuditEntry[];
  /** Cursor returned by the previous audit page (null = first page). */
  auditCursor: string | null;
  /** True when more audit pages exist. */
  auditHasMore: boolean;
  /** Action filter for the audit tab (null = no filter). */
  auditActionFilter: AuditAction | null;
  /** True while an audit request is in flight. */
  auditLoading: boolean;
  /** Audit-tab-specific error message (null = none). */
  auditError: string | null;
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
