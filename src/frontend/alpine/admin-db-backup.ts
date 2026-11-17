// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin database backup/restore panel state.
 *
 * Talks to the shipped routes in src/routes/admin/db-backup.ts:
 *   GET  /api/admin/db/backup  — list snapshot files
 *   POST /api/admin/db/backup  — create a consistent VACUUM INTO snapshot
 *   POST /api/admin/db/restore — replace the live database (restart required)
 *
 * Restore is a two-step action: the operator selects a snapshot and types
 * RESTORE before the destructive request is sent.
 */
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";

/** One snapshot row from the list endpoint. */
export interface DbBackupEntry {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

/** Alpine component state for the backup panel. */
export interface AdminDbBackupState {
  backups: DbBackupEntry[];
  dir: string;
  loading: boolean;
  creating: boolean;
  restoring: boolean;
  error: string;
  message: string;
  restoreTarget: string | null;
  confirmation: string;
  /** Alpine lifecycle hook — loads the initial snapshot list. */
  init(): Promise<void>;
  /** Refresh the snapshot list. */
  loadBackups(): Promise<void>;
  /** Create a new snapshot. */
  createBackup(): Promise<void>;
  /** Open the restore confirmation for one snapshot. */
  beginRestore(name: string,): void;
  /** Abandon the pending restore. */
  cancelRestore(): void;
  /** Execute the confirmed restore. */
  confirmRestore(): Promise<void>;
  /** Locale-aware compact size label. */
  sizeLabel(bytes: number,): string;
}

/**
 * Read a server error message without swallowing the failure.
 * @param res - failed response
 * @param fallbackKey - translation key when the body has no message
 * @returns {Promise<string>}
 */
async function errorFromResponse(res: Response, fallbackKey: string,): Promise<string> {
  const body = jsonParseOr<{ message?: string; error?: string }>(await res.text(), {},);
  return body.message ?? body.error ?? t(fallbackKey,);
}

/**
 * Build a fresh backup panel state. Registered globally so the panel partial
 * can use `x-data="adminDbBackup()"`, the same pattern as gameCanvas().
 * @returns {AdminDbBackupState}
 */
export function createAdminDbBackup(): AdminDbBackupState {
  return {
    backups: [],
    dir: "",
    loading: false,
    creating: false,
    restoring: false,
    error: "",
    message: "",
    restoreTarget: null,
    confirmation: "",

    async init() {
      await this.loadBackups();
    },

    async loadBackups() {
      if (this.loading) { return; }
      this.loading = true;
      this.error = "";
      try {
        const res = await apiFetch("/api/admin/db/backup", { headers: { Accept: "application/json", }, },);
        if (!res.ok) {
          this.error = await errorFromResponse(res, "admin.dbBackup.loadFailed",);
          return;
        }

        const body = await res.json() as { backups?: DbBackupEntry[]; dir?: string };
        this.backups = Array.isArray(body.backups,) ? body.backups : [];
        this.dir = body.dir ?? "";
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("admin.dbBackup.loadFailed",);
      } finally {
        this.loading = false;
      }
    },

    async createBackup() {
      if (this.creating) { return; }
      this.creating = true;
      this.error = "";
      this.message = "";
      try {
        const res = await apiFetch("/api/admin/db/backup", {
          method: "POST",
          headers: { Accept: "application/json", },
        },);

        if (!res.ok) {
          this.error = await errorFromResponse(res, "admin.dbBackup.createFailed",);
          return;
        }

        await this.loadBackups();
        this.message = t("admin.dbBackup.createDone",);
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("admin.dbBackup.createFailed",);
      } finally {
        this.creating = false;
      }
    },

    beginRestore(name: string,) {
      this.restoreTarget = name;
      this.confirmation = "";
      this.error = "";
      this.message = "";
    },

    cancelRestore() {
      this.restoreTarget = null;
      this.confirmation = "";
    },

    async confirmRestore() {
      if (this.restoring || !this.restoreTarget || this.confirmation !== "RESTORE") { return; }
      this.restoring = true;
      this.error = "";
      this.message = "";
      try {
        const res = await apiFetch("/api/admin/db/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonBody({ name: this.restoreTarget, confirmation: this.confirmation, },),
        },);

        if (!res.ok) {
          this.error = await errorFromResponse(res, "admin.dbBackup.restoreFailed",);
          return;
        }

        const body = await res.json() as { restartRequired?: boolean };
        this.message = body.restartRequired === false
          ? t("admin.dbBackup.restoreDone",)
          : `${t("admin.dbBackup.restoreDone",)} ${t("admin.dbBackup.restartRequired",)}`;

        this.restoreTarget = null;
        this.confirmation = "";
        await this.loadBackups();
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("admin.dbBackup.restoreFailed",);
      } finally {
        this.restoring = false;
      }
    },

    sizeLabel(bytes: number,) {
      return new Intl.NumberFormat(undefined, {
        notation: "compact",
        style: "unit",
        unit: "byte",
        unitDisplay: "short",
        maximumFractionDigits: 1,
      },).format(bytes,);
    },
  };
}

(globalThis as unknown as Record<string, unknown>).adminDbBackup = createAdminDbBackup;
