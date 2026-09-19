// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory Panel Component
 *
 * Wires the memory panel UI to the backend CRUD API at /api/actors/:id/memories.
 * Loads character memories from the active chat's actor participants.
 */

import { jsonBody, } from "./json";
import { memoryPanelActions, } from "./memory-panel-actions";
import {
  auditEntriesForFilter,
  AUDIT_ACTIONS,
  memoriesForTab,
  type MemoryApiRow,
  toAuditEntry,
  toMemoryEntry,
} from "./memory-panel/transform";
import type { AuditAction, ChatState, MemoryEntry, } from "./types";

export const memoryPanel: Partial<ChatState> & ThisType<ChatState> = {
  ...memoryPanelActions,
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
    searchQuery: "",
    loading: false,
    tokenBudget: 1024,
    tokensUsed: 0,
    showCreateForm: false,
    newMemoryContent: "",
    busy: false,
    error: null,
    editingMemoryId: null,
    editMemoryContent: "",
  },

  /**
   * Get the character actor ID from chat participants.
   * In a character chat, the first non-user participant is the character.
   * @returns the character actor id, or null when no non-user participant exists
   */
  _getCharacterActorId(): string | null {
    const participants = this._chatParticipants;
    if (!participants || participants.length === 0) { return null; }

    // Find the first participant that is NOT the current user
    const charParticipant = participants.find(
      (p,) => p.actor_id !== this.userRole && p.display_name !== this.userDisplayName,
    );
    return charParticipant?.actor_id ?? null;
  },

  async loadMemories() {
    this.memoryPanel.loading = true;
    try {
      const actorId = this._getCharacterActorId();
      if (!actorId) {
        this.memoryPanel.characterMemories = [];
        this.memoryPanel.assistantMemories = [];
        this.memoryPanel.worldMemories = [];
        return;
      }

      const res = await apiFetch(`/api/actors/${actorId}/memories`,);
      if (!res.ok) { return; }
      const data = await res.json() as { items?: MemoryApiRow[] };

      const characterMemories: MemoryEntry[] = [];
      const assistantMemories: MemoryEntry[] = [];
      const worldMemories: MemoryEntry[] = [];
      const items = data.items ?? [];
      for (const m of items) {
        const entry = toMemoryEntry(m, "character",);
        if (entry.scope === "assistant") {
          assistantMemories.push(entry,);
        } else if (entry.scope === "world") {
          worldMemories.push(entry,);
        } else {
          characterMemories.push(entry,);
        }
      }

      this.memoryPanel.characterMemories = characterMemories;
      this.memoryPanel.assistantMemories = assistantMemories;
      this.memoryPanel.worldMemories = worldMemories;
      this._updateTokenCount();
    } catch {
      // Silently fail — memories are non-critical
    } finally {
      this.memoryPanel.loading = false;
    }
  },

  getFilteredMemories(): MemoryEntry[] {
    const panel = this.memoryPanel;
    const query = panel.searchQuery.toLowerCase();
    const memories = memoriesForTab(panel, panel.activeTab,);
    if (!query) { return memories; }

    const filtered: MemoryEntry[] = [];
    for (const m of memories) {
      if (
        m.content.toLowerCase().includes(query,) ||
        m.keywords.some((k,) => k.toLowerCase().includes(query,))
      ) {
        filtered.push(m,);
      }
    }
    return filtered;
  },

  getCurrentMemoryList(): MemoryEntry[] {
    return memoriesForTab(this.memoryPanel, this.memoryPanel.activeTab,);
  },

  searchMemories() {
    // Triggers Alpine reactivity via x-model
  },

  async createMemory() {
    if (!this.memoryPanel.newMemoryContent.trim()) { return; }

    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }

    try {
      const res = await apiFetch(`/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          content: this.memoryPanel.newMemoryContent.trim(),
          memoryType: "episodic",
          confidence: 1,
          importance: 5,
          keywords: [],
          scope: this.memoryPanel.activeTab,
        },),
      },);
      if (!res.ok) { return; }
      const created = await res.json() as MemoryApiRow;

      const newMemory = toMemoryEntry(created, this.memoryPanel.activeTab,);
      this.getCurrentMemoryList().unshift(newMemory,);
      this.memoryPanel.newMemoryContent = "";
      this.memoryPanel.showCreateForm = false;
      this._updateTokenCount();
    } catch {
      // Silently fail
    }
  },

  async deleteMemory(memoryId: string,) {
    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }

    try {
      await apiFetch(`/api/actors/${actorId}/memories/${memoryId}`, {
        method: "DELETE",
      },);
    } catch {
      // proceed with local removal even if API fails
    }

    const memories = this.getCurrentMemoryList();
    const idx = memories.findIndex((m,) => m.id === memoryId);
    if (idx !== -1) {
      memories.splice(idx, 1,);
      this._updateTokenCount();
    }
  },

  async toggleMemoryPin(memoryId: string,) {
    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }

    const mem = this.getCurrentMemoryList().find((m,) => m.id === memoryId);
    if (!mem) { return; }

    mem.pinned = !mem.pinned;

    try {
      await apiFetch(`/api/actors/${actorId}/memories/${memoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ pinned: mem.pinned, },),
      },);
    } catch {
      // Revert on failure
      mem.pinned = !mem.pinned;
    }
  },

  /**
   * True when the user may write world memories (admin/solo roles).
   * @returns whether the current role may write world memories
   */
  _isWorldAdmin(): boolean {
    return this.userRole === "admin" || this.userRole === "solo";
  },

  /**
   * True when write actions are allowed on the active tab (world tab is admin-managed).
   * @returns whether the active tab accepts writes for this role
   */
  _canWriteActiveTab(): boolean {
    return this.memoryPanel.activeTab !== "world" || this._isWorldAdmin();
  },

  startEditMemory(mem: MemoryEntry,) {
    if (!this._canWriteActiveTab()) { return; }
    this.memoryPanel.editingMemoryId = mem.id;
    this.memoryPanel.editMemoryContent = mem.content;
  },

  _updateTokenCount() {
    const allMemories = [
      ...this.memoryPanel.characterMemories,
      ...this.memoryPanel.assistantMemories,
      ...this.memoryPanel.worldMemories,
    ];
    let total = 0;
    for (const m of allMemories) { total += m.tokenCount || 0; }
    this.memoryPanel.tokensUsed = total;
  },

  // ── Audit tab (FEAT-075) ──────────────────────────────────────────
  /** Known audit action filter chips. */
  auditActions: AUDIT_ACTIONS,

  /** Audit entries after the current action filter is applied. */
  getFilteredAudit() {
    return auditEntriesForFilter(this.memoryPanel.auditEntries, this.memoryPanel.auditActionFilter,);
  },

  /**
   * Build the audit endpoint URL for the active chat's character actor.
   * Returns null when no actor can be resolved (panel hidden).
   * @param cursor - pagination cursor (omit for first page)
   * @param action - action filter (omit for unfiltered)
   */
  _auditUrl(cursor: string | null, action: AuditAction | null,): string | null {
    const actorId = this._getCharacterActorId();
    if (!actorId) { return null; }
    const params = new URLSearchParams();
    if (cursor) { params.set("cursor", cursor,); }
    if (action) { params.set("action", action,); }
    params.set("limit", "25",);
    const qs = params.toString();
    return `/api/actors/${actorId}/memories/audit${qs ? `?${qs}` : ""}`;
  },

  /**
   * Load (or reload) the audit log, replacing any existing entries. Called
   * when the audit tab opens or the action filter changes.
   * @param action - optional action filter override
   */
  async loadAudit(action?: AuditAction | null,) {
    const filter = action === undefined ? this.memoryPanel.auditActionFilter : action;
    if (action !== undefined) { this.memoryPanel.auditActionFilter = action; }
    this.memoryPanel.auditLoading = true;
    this.memoryPanel.auditError = null;
    try {
      const url = this._auditUrl(null, filter,);
      if (!url) {
        this.memoryPanel.auditEntries = [];
        this.memoryPanel.auditCursor = null;
        this.memoryPanel.auditHasMore = false;
        return;
      }
      const res = await globalThis.apiFetch(url,);
      if (!res.ok) { throw new Error(`audit fetch failed: ${res.status}`,); }
      const page = (await res.json()) as { entries: Array<Record<string, unknown>>; nextCursor?: string | null };
      this.memoryPanel.auditEntries = page.entries.map((r,) => toAuditEntry(r as never,));
      this.memoryPanel.auditCursor = page.nextCursor ?? null;
      this.memoryPanel.auditHasMore = !!page.nextCursor;
    } catch (err) {
      this.memoryPanel.auditError = err instanceof Error ? err.message : String(err,);
      this.memoryPanel.auditEntries = [];
      this.memoryPanel.auditCursor = null;
      this.memoryPanel.auditHasMore = false;
    } finally {
      this.memoryPanel.auditLoading = false;
    }
  },

  /** Append the next page of audit entries to the current list. */
  async loadMoreAudit() {
    if (!this.memoryPanel.auditHasMore || this.memoryPanel.auditLoading) { return; }
    this.memoryPanel.auditLoading = true;
    this.memoryPanel.auditError = null;
    try {
      const url = this._auditUrl(this.memoryPanel.auditCursor, this.memoryPanel.auditActionFilter,);
      if (!url) { return; }
      const res = await globalThis.apiFetch(url,);
      if (!res.ok) { throw new Error(`audit fetch failed: ${res.status}`,); }
      const page = (await res.json()) as { entries: Array<Record<string, unknown>>; nextCursor?: string | null };
      this.memoryPanel.auditEntries = [
        ...this.memoryPanel.auditEntries,
        ...page.entries.map((r,) => toAuditEntry(r as never,)),
      ];
      this.memoryPanel.auditCursor = page.nextCursor ?? null;
      this.memoryPanel.auditHasMore = !!page.nextCursor;
    } catch (err) {
      this.memoryPanel.auditError = err instanceof Error ? err.message : String(err,);
    } finally {
      this.memoryPanel.auditLoading = false;
    }
  },

  /**
   * Set the action filter and reload the first page.
   * @param action
   */
  async setAuditActionFilter(action: AuditAction | null,) {
    if (this.memoryPanel.auditActionFilter === action) { return; }
    await this.loadAudit(action,);
  },
};
