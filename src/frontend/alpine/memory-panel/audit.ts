// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory panel — audit tab state and actions (FEAT-075).
 *
 * Loaded lazily when the audit tab opens; supports cursor pagination and
 * per-action filtering against GET /api/v1/actors/:actorId/memories/audit.
 */
import type { AuditAction, ChatState, } from "../types";
import {
  AUDIT_ACTIONS,
  auditActionIcon,
  auditActionLabel,
  type AuditApiRow,
  auditEntriesForFilter,
  toAuditEntry,
} from "./transform";

/** Audit-tab slice merged into the memory panel component. */
export const memoryPanelAudit: Partial<ChatState> & ThisType<ChatState> = {
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
    return `/api/v1/actors/${actorId}/memories/audit${qs ? `?${qs}` : ""}`;
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
      const page = (await res.json()) as { entries: AuditApiRow[]; nextCursor?: string | null };
      this.memoryPanel.auditEntries = page.entries.map((r,) => toAuditEntry(r,));
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
      const page = (await res.json()) as { entries: AuditApiRow[]; nextCursor?: string | null };
      this.memoryPanel.auditEntries = [
        ...this.memoryPanel.auditEntries,
        ...page.entries.map((r,) => toAuditEntry(r,)),
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
   * @param action - action to filter by, or null to clear
   */
  async setAuditActionFilter(action: AuditAction | null,) {
    if (this.memoryPanel.auditActionFilter === action) { return; }
    await this.loadAudit(action,);
  },

  /** Resolve the icon/emoji for an audit action badge. */
  _auditActionIcon(action: AuditAction,): string {
    return auditActionIcon(action,);
  },

  /** Resolve the human-readable label for an audit action badge. */
  _auditActionLabel(action: AuditAction,): string {
    return auditActionLabel(action,);
  },
};
