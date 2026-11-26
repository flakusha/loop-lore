// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/resource/backup-scheduler.ts — event-driven backup scheduling.
//
// Thin failure-safe surface over the `backupHooks` seams in
// external-storage.ts. Host flows (chat archive, asset upload, game-state
// store) call one schedule function each; every path below NEVER throws —
// a missing store, quota overflow, or hook failure is logged and skipped
// so the host flow always completes.
//
// Inert by default: nothing is scheduled until `configureBackupScheduling`
// flips the master `enabled` flag AND the owner has an active provisioned
// storage endpoint. Per-trigger flags allow disabling one trigger without
// touching the others.

import type { Kysely, } from "kysely";
import { createDbBackup, dbBackupDir, pruneDbSnapshots, } from "../db/backup-restore";
import { getSqliteDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { jsonStringifyOr, safeJsonParse, } from "../utils";
import {
  BACKUP_PRUNE_KEEP_DEFAULT,
  type BackupHook,
  backupHooks,
  type BackupTrigger,
  listStorageResources,
  persistBackupHook,
  pruneBackups,
  registerBackupHook,
} from "./external-storage";

/** Scheduler toggles. Master `enabled` defaults off; triggers default on. */
interface BackupSchedulerConfig {
  enabled: boolean;
  onChatEnd: boolean;
  onAssetUpload: boolean;
  onWorldSave: boolean;
  onDbSnapshot: boolean;
  keepSnapshots: number;
}

let config: BackupSchedulerConfig = {
  enabled: false,
  onChatEnd: true,
  onAssetUpload: true,
  onWorldSave: true,
  onDbSnapshot: true,
  keepSnapshots: BACKUP_PRUNE_KEEP_DEFAULT,
};

/** Process-local DB snapshot hook: VACUUM INTO the server-derived dir, then prune. */
const persistDbSnapshotHook: BackupHook = async () => {
  const sqlite = getSqliteDatabase();
  if (!sqlite) { return; }
  const dir = dbBackupDir();
  await createDbBackup({ sqlite, dir, },);
  pruneDbSnapshots(dir, config.keepSnapshots,);
};

/** Flip scheduling toggles; enabling wires the persisting hook into all seams. */
export function configureBackupScheduling(partial: Partial<BackupSchedulerConfig>,): void {
  const keep = partial.keepSnapshots ?? config.keepSnapshots;
  config = {
    ...config,
    ...partial,
    // ponytail: one snapshot is always retained; a bad config never prunes all.
    keepSnapshots: Number.isFinite(keep,) ? Math.max(1, Math.floor(keep,),) : BACKUP_PRUNE_KEEP_DEFAULT,
  };

  if (config.enabled) {
    registerBackupHook("onChatEnd", persistBackupHook,);
    registerBackupHook("onAssetUpload", persistBackupHook,);
    registerBackupHook("onWorldSave", persistBackupHook,);
    registerBackupHook("onDbSnapshot", persistDbSnapshotHook,);
  }
}

/** Test/isolation reset: inert flags plus no-op hooks. */
export function resetBackupScheduling(): void {
  config = {
    enabled: false,
    onChatEnd: true,
    onAssetUpload: true,
    onWorldSave: true,
    onDbSnapshot: true,
    keepSnapshots: BACKUP_PRUNE_KEEP_DEFAULT,
  };

  const noop = async (): Promise<void> => {/* reset: hooks persist nothing */};
  registerBackupHook("onChatEnd", noop,);
  registerBackupHook("onAssetUpload", noop,);
  registerBackupHook("onWorldSave", noop,);
  registerBackupHook("onDbSnapshot", noop,);
}

/** Master enablement flag (provisioning is checked per schedule call). */
export function isBackupSchedulingEnabled(): boolean {
  return config.enabled;
}

/** Outcome of one schedule attempt; `scheduled: false` never throws. */
export interface ScheduleResult {
  scheduled: boolean;
  reason?: "disabled" | "trigger-disabled" | "no-storage" | "failed";
}

interface ScheduleInput {
  ownerId: string;
  storageQuotaBytes?: number;
}

function logWarn(message: string, bindings: Record<string, unknown>,): void {
  try {
    getChildLogger("resource-backup",)?.warn(message, bindings,);
  } catch { /* logging must never break the host flow */ }
}

async function schedule(
  db: Kysely<DB>,
  hook: keyof typeof backupHooks,
  triggerEnabled: boolean,
  trigger: BackupTrigger,
  // Process-local DB snapshots need no external storage endpoint; the three
  // resource triggers keep the provisioning gate.
  requireStorage = true,
): Promise<ScheduleResult> {
  try {
    if (!config.enabled) { return { scheduled: false, reason: "disabled", }; }
    if (!triggerEnabled) { return { scheduled: false, reason: "trigger-disabled", }; }

    // Owner opt-out: users.settings JSON carrying backupEnabled:false skips
    // the schedule. Missing row / unparseable settings fail open (schedule
    // as today); a settings-read error never throws into the host flow.
    try {
      const owner = await db
        .selectFrom("users",)
        .select("settings",)
        .where("id", "=", trigger.ownerId,)
        .executeTakeFirst();

      if (owner) {
        const parsed = safeJsonParse<{ backupEnabled?: unknown }>(owner.settings,);
        if (parsed.ok && parsed.value?.backupEnabled === false) {
          return { scheduled: false, reason: "disabled", };
        }
      }
    } catch (error: unknown) {
      logWarn("backup schedule: owner opt-out lookup failed, failing open", {
        ownerId: trigger.ownerId,
        resourceType: trigger.resourceType,
        error: error instanceof Error ? error.message : String(error,),
      },);
    }

    if (requireStorage) {
      let provisioned = false;
      try {
        const stores = await listStorageResources(db, trigger.ownerId,);
        provisioned = stores.some((s,) => s.status === "active");
      } catch (error: unknown) {
        logWarn("backup schedule skipped: storage lookup failed", {
          ownerId: trigger.ownerId,
          resourceType: trigger.resourceType,
          error: error instanceof Error ? error.message : String(error,),
        },);

        return { scheduled: false, reason: "no-storage", };
      }

      if (!provisioned) { return { scheduled: false, reason: "no-storage", }; }
    }

    await backupHooks[hook](db, trigger,);
    try {
      await pruneBackups(db, { ownerId: trigger.ownerId, resourceType: trigger.resourceType, },);
    } catch (error: unknown) {
      logWarn("backup prune skipped", {
        ownerId: trigger.ownerId,
        resourceType: trigger.resourceType,
        error: error instanceof Error ? error.message : String(error,),
      },);
    }

    return { scheduled: true, };
  } catch (error: unknown) {
    logWarn("backup schedule skipped: hook failed", {
      hook,
      ownerId: trigger.ownerId,
      resourceType: trigger.resourceType,
      error: error instanceof Error ? error.message : String(error,),
    },);

    return { scheduled: false, reason: "failed", };
  }
}

/**
 * Chat-end trigger: call after a chat closes/archives with the owner's id.
 * Payload carries the chat's messages (not just the id) so the backup is
 * restorable without re-reading the live tables.
 */
export async function scheduleChatEndBackup(
  db: Kysely<DB>,
  input: ScheduleInput & { chatId: string; messages?: unknown },
): Promise<ScheduleResult> {
  let messages = input.messages;
  if (messages === undefined) {
    try {
      messages = await db
        .selectFrom("messages",)
        .select(["id", "actor_id", "role", "content", "created_at",],)
        .where("chat_id", "=", input.chatId,)
        .orderBy("created_at", "asc",)
        .execute();
    } catch {
      messages = [];
    }
  }

  return schedule(db, "onChatEnd", config.onChatEnd, {
    ownerId: input.ownerId,
    resourceType: "chat",
    payload: jsonStringifyOr({ chatId: input.chatId, messages: messages ?? [], },),
    ...(input.storageQuotaBytes !== undefined ? { storageQuotaBytes: input.storageQuotaBytes, } : {}),
  },);
}

/**
 * Asset-upload trigger: call after an asset row commits. The payload carries
 * the assetId + contentHash resolve keys plus the row ref (storagePath,
 * mimeType, filename, sizeBytes) so restore can locate the bytes; messageId
 * links the upload back to the chat message that attached it when known.
 */
export async function scheduleAssetUploadBackup(
  db: Kysely<DB>,
  input: ScheduleInput & {
    assetId: string;
    contentHash: string;
    storagePath?: string;
    mimeType?: string;
    filename?: string;
    sizeBytes?: number;
    messageId?: string;
  },
): Promise<ScheduleResult> {
  let ref: Record<string, unknown> = {
    ...(input.storagePath !== undefined ? { storagePath: input.storagePath, } : {}),
    ...(input.mimeType !== undefined ? { mimeType: input.mimeType, } : {}),
    ...(input.filename !== undefined ? { filename: input.filename, } : {}),
    ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes, } : {}),
    ...(input.messageId !== undefined ? { messageId: input.messageId, } : {}),
  };

  if (Object.keys(ref,).length === 0) {
    try {
      const row = await db
        .selectFrom("assets",)
        .select(["storage_path", "mime_type", "filename", "size_bytes",],)
        .where("id", "=", input.assetId,)
        .executeTakeFirst();

      if (row) {
        ref = {
          storagePath: row.storage_path,
          mimeType: row.mime_type,
          filename: row.filename,
          sizeBytes: row.size_bytes,
        };
      }
    } catch { /* fail-open: keys alone still resolve via backupResourceId */ }
  }

  return schedule(db, "onAssetUpload", config.onAssetUpload, {
    ownerId: input.ownerId,
    resourceType: "asset",
    payload: jsonStringifyOr({ assetId: input.assetId, contentHash: input.contentHash, ...ref, },),
    ...(input.storageQuotaBytes !== undefined ? { storageQuotaBytes: input.storageQuotaBytes, } : {}),
  },);
}

/** World-save trigger: call after a game-state snapshot persists. */
export async function scheduleWorldSaveBackup(
  db: Kysely<DB>,
  input: ScheduleInput & { chatId: string; payload: string },
): Promise<ScheduleResult> {
  return schedule(db, "onWorldSave", config.onWorldSave, {
    ownerId: input.ownerId,
    resourceType: "world",
    payload: input.payload,
    ...(input.storageQuotaBytes !== undefined ? { storageQuotaBytes: input.storageQuotaBytes, } : {}),
  },);
}

/**
 * DB-snapshot trigger: one call in, one VACUUM INTO snapshot out, then the
 * shared retention prune (10 newest kept). Uses the same failure-safe
 * `schedule` path and the SAME scheduler as the three resource triggers — no
 * timer, no second loop, no external-storage requirement.
 *
 * Trust boundary: process-local only. There is NO HTTP trigger for this seam.
 * // ponytail: a future remote trigger must add its own server-side
 * // permission check (admin.system) before calling this function; endpoint
 * // obscurity is not a control.
 */
export async function scheduleDbSnapshotBackup(
  db: Kysely<DB>,
  input: ScheduleInput,
): Promise<ScheduleResult> {
  return schedule(db, "onDbSnapshot", config.onDbSnapshot, {
    ownerId: input.ownerId,
    resourceType: "db",
    payload: jsonStringifyOr({ kind: "db-snapshot", },),
    ...(input.storageQuotaBytes !== undefined ? { storageQuotaBytes: input.storageQuotaBytes, } : {}),
  }, false,);
}
