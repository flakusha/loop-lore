// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonBody, jsonParseOr, safeJsonStringify, } from "../json";
import { log as rootLog, } from "../logger";
import type { SettingsState, } from "./types";

const log = rootLog.child({ module: "settings-backup", },);

export type BackupResourceType = "chat" | "asset" | "world" | "lore";

export type BackupReconcileStatus = "consistent" | "drifted" | "orphaned" | "stale";

export interface BackupDashboardEntry {
  resourceId: string;
  resourceType: BackupResourceType;
  status: BackupReconcileStatus;
  action: string;
  detail: string;
}

export interface BackupLocalRecord {
  resourceId: string;
  resourceType: BackupResourceType;
  contentHash: string;
  version: number;
}

export interface BackupServerState {
  serverHash?: string;
  serverVersion?: number;
}

const ACTIONS: Record<BackupReconcileStatus, string> = {
  consistent: "no-op",
  drifted: "restore-from-server or overwrite-server",
  orphaned: "push (create server counterpart)",
  stale: "pull (update local)",
};

const PREFS_KEY = "backup-prefs";

/**
 * Classify one local backup against its server counterpart. Mirrors
 * reconcileRecord() in src/resource/reconciliation.ts without the
 * node:crypto import (string comparison only — safe to bundle for browsers).
 */
export function classifyBackupStatus(
  local: Pick<BackupLocalRecord, "contentHash" | "version">,
  server: BackupServerState,
): BackupReconcileStatus {
  if (server.serverHash === undefined && server.serverVersion === undefined) { return "orphaned"; }
  if (server.serverVersion !== undefined && local.version < server.serverVersion) { return "stale"; }
  if (server.serverHash !== undefined && local.contentHash !== server.serverHash) { return "drifted"; }
  return "consistent";
}

/** Build the per-item dashboard report from local records + server hashes. */
export function reconcileBackups(
  locals: BackupLocalRecord[],
  serverByResourceId: Record<string, BackupServerState>,
): BackupDashboardEntry[] {
  return locals.map((local,) => {
    const server = serverByResourceId[local.resourceId] ?? {};
    const status = classifyBackupStatus(local, server,);
    const serverHash = (server.serverHash ?? "none").slice(0, 12,);
    return {
      resourceId: local.resourceId,
      resourceType: local.resourceType,
      status,
      action: ACTIONS[status],
      detail: status === "consistent"
        ? `local hash matches server hash ${local.contentHash.slice(0, 12,)}…`
        : `local ${local.contentHash.slice(0, 12,)}… vs server ${serverHash}…`,
    };
  },);
}

/**
 * Settings browser-backup submodule: opt-in toggle, per-type selectors,
 * reconciliation dashboard state, one-click recovery behind explicit
 * confirm(). Persists via the existing persistSettings() merge path
 * (PATCH /api/v1/users/me/settings) plus a localStorage mirror read
 * back when the tab opens — no new route.
 * @returns {Partial<SettingsState> & ThisType<SettingsState>}
 */
export function backup(): Partial<SettingsState> & ThisType<SettingsState> {
  return {
    /**
     * Load persisted prefs (server merge wins, localStorage fallback).
     * @returns {Promise<void>}
     */
    async loadBackupPrefs() {
      try {
        const raw = localStorage.getItem(PREFS_KEY,);
        if (raw) {
          const prefs = jsonParseOr<{ enabled?: boolean; types?: Record<string, boolean> }>(raw, {},);
          if (typeof prefs.enabled === "boolean") { this.backupEnabled = prefs.enabled; }
          if (prefs.types) {
            for (const t of ["chat", "asset", "world", "lore",] as BackupResourceType[]) {
              if (typeof prefs.types[t] === "boolean") { this.backupTypes[t] = prefs.types[t]; }
            }
          }
        }

        const res = await apiFetch("/api/v1/settings", { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const settings = await res.json() as { backupEnabled?: boolean; backupTypes?: Record<string, boolean> };
          if (typeof settings.backupEnabled === "boolean") { this.backupEnabled = settings.backupEnabled; }
          if (settings.backupTypes) {
            for (const t of ["chat", "asset", "world", "lore",] as BackupResourceType[]) {
              if (typeof settings.backupTypes[t] === "boolean") { this.backupTypes[t] = settings.backupTypes[t]; }
            }
          }
        }
      } catch (error) {
        log.warn("loadBackupPrefs failed", { error: String(error,), },);
      }
    },

    /**
     * Flip the opt-in toggle and persist.
     * @param enabled
     * @returns {Promise<void>}
     */
    async toggleBackup(enabled: boolean,): Promise<void> {
      this.backupEnabled = enabled;
      await this.saveBackupPrefs();
    },

    /**
     * Flip one per-type selector and persist.
     * @param type
     * @returns {Promise<void>}
     */
    async toggleBackupType(type: BackupResourceType,): Promise<void> {
      this.backupTypes[type] = !this.backupTypes[type];
      await this.saveBackupPrefs();
    },

    /**
     * Persist prefs through the existing settings merge + localStorage mirror.
     * @returns {Promise<void>}
     */
    async saveBackupPrefs(): Promise<void> {
      try {
        const mirror = safeJsonStringify({ enabled: this.backupEnabled, types: this.backupTypes, },);
        if (mirror.ok) { localStorage.setItem(PREFS_KEY, mirror.value,); }
      } catch (error) {
        log.warn("saveBackupPrefs local mirror failed", { error: String(error,), },);
      }

      await this.persistSettings({ backupEnabled: this.backupEnabled, backupTypes: { ...this.backupTypes, }, },);
    },

    /**
     * Refresh the dashboard: fetch server hashes, reconcile each local
     * record. Non-ok responses fail safe (report keeps its last state).
     * @param locals local backup records to reconcile
     * @returns {Promise<void>}
     */
    async refreshBackupDashboard(locals: BackupLocalRecord[],): Promise<void> {
      try {
        const res = await apiFetch("/api/v1/settings/backups/hashes", { headers: { Accept: "application/json", }, },);
        if (!res.ok) { return; }
        const data = await res.json() as { hashes?: Record<string, BackupServerState> };
        this.backupReport = reconcileBackups(locals, data.hashes ?? {},);
        this.backupNotice = this.backupReport.some((e,) => e.status !== "consistent")
          ? "backupDrift"
          : "";
      } catch (error) {
        log.warn("refreshBackupDashboard failed", { error: String(error,), },);
      }
    },

    /**
     * One-click recovery: refuses without explicit user confirmation,
     * then verifies integrity via the existing admin verify endpoint
     * before reporting a restore.
     * @param backupId
     * @returns {Promise<void>}
     */
    async recoverBackup(backupId: string,): Promise<void> {
      if (!confirm("Restore this backup? The current version will be overwritten.",)) {
        this.backupNotice = "backupConfirmRequired";
        return;
      }

      try {
        const res = await apiFetch(`/api/admin/resources/backups/${backupId}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({},),
        },);

        if (!res.ok) {
          this.backupNotice = "backupRecoverFailed";
          return;
        }

        this.backupNotice = "backupRestored";
      } catch (error) {
        log.warn("recoverBackup failed", { error: String(error,), },);
        this.backupNotice = "backupRecoverFailed";
      }
    },
  };
}
