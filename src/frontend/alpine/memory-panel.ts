// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory Panel Component
 *
 * Wires the memory panel UI to the backend CRUD API at /api/v1/actors/:id/memories.
 * Loads character memories from the active chat's actor participants.
 */

import { memoryPanelActions, } from "./memory-panel-actions";
import { memoryPanelCore, } from "./memory-panel-core";
import { memoryPanelAudit, } from "./memory-panel/audit";
import { formatMemoryDate as formatMemoryDateIso, injectAuditKinds, } from "./memory-panel/transform";
import type { AuditEntry, ChatState, } from "./types";

export const memoryPanel: Partial<ChatState> & ThisType<ChatState> = {
  ...memoryPanelActions,
  ...memoryPanelCore,
  memoryPanel: {
    activeTab: "character",
    characterMemories: [],
    assistantMemories: [],
    worldMemories: [],
    auditEntries: [],
    auditCursor: null,
    auditHasMore: false,
    auditActionFilter: null,
    auditLoading: false,
    auditError: null,
    auditExpandedIds: [],
    searchQuery: "",
    loading: false,
    tokenBudget: 1024,
    tokensUsed: 0,
    showCreateForm: false,
    newMemoryContent: "",
    newMemoryType: "episodic",
    busy: false,
    error: null,
    editingMemoryId: null,
    editMemoryContent: "",
  },

  getInjectAuditKinds(entry: AuditEntry,): string[] {
    return injectAuditKinds(entry, this.memoryPanel,);
  },

  /**
   * Format a memory row timestamp for display (BUG-formatmemorydate:
   * the template calls this, so it must exist on the component itself).
   * @param value - ISO timestamp from a memory row
   * @returns Locale-formatted date, or "" for invalid input
   */
  formatMemoryDate(value: string,): string {
    return formatMemoryDateIso(value,);
  },

  // ── Audit tab (FEAT-075) ──────────────────────────────────────────
  ...memoryPanelAudit,
};
