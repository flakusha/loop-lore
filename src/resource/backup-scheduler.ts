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
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import {
  backupHooks,
  type BackupTrigger,
  listStorageResources,
  persistBackupHook,
  registerBackupHook,
} from "./external-storage";

/** Scheduler toggles. Master `enabled` defaults off; triggers default on. */
interface BackupSchedulerConfig {
  enabled: boolean;
  onChatEnd: boolean;
  onAssetUpload: boolean;
  onWorldSave: boolean;
}

let config: BackupSchedulerConfig = {
  enabled: false,
  onChatEnd: true,
  onAssetUpload: true,
  onWorldSave: true,
};

/** Flip scheduling toggles; enabling wires the persisting hook into all seams. */
export function configureBackupScheduling(partial: Partial<BackupSchedulerConfig>,): void {
  config = { ...config, ...partial, };
  if (config.enabled) {
    registerBackupHook("onChatEnd", persistBackupHook,);
    registerBackupHook("onAssetUpload", persistBackupHook,);
    registerBackupHook("onWorldSave", persistBackupHook,);
  }
}

/** Test/isolation reset: inert flags plus no-op hooks. */
export function resetBackupScheduling(): void {
  config = { enabled: false, onChatEnd: true, onAssetUpload: true, onWorldSave: true, };
  const noop = async (): Promise<void> => {/* reset: hooks persist nothing */};
  registerBackupHook("onChatEnd", noop,);
  registerBackupHook("onAssetUpload", noop,);
  registerBackupHook("onWorldSave", noop,);
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
): Promise<ScheduleResult> {
  try {
    if (!config.enabled) { return { scheduled: false, reason: "disabled", }; }
    if (!triggerEnabled) { return { scheduled: false, reason: "trigger-disabled", }; }

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

    await backupHooks[hook](db, trigger,);
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

/** Chat-end trigger: call after a chat closes/archives with the owner's id. */
export async function scheduleChatEndBackup(
  db: Kysely<DB>,
  input: ScheduleInput & { chatId: string },
): Promise<ScheduleResult> {
  return schedule(db, "onChatEnd", config.onChatEnd, {
    ownerId: input.ownerId,
    resourceType: "chat",
    payload: jsonStringifyOr({ chatId: input.chatId, },),
    ...(input.storageQuotaBytes !== undefined ? { storageQuotaBytes: input.storageQuotaBytes, } : {}),
  },);
}

/** Asset-upload trigger: call after an asset row commits. */
export async function scheduleAssetUploadBackup(
  db: Kysely<DB>,
  input: ScheduleInput & { assetId: string; contentHash: string },
): Promise<ScheduleResult> {
  return schedule(db, "onAssetUpload", config.onAssetUpload, {
    ownerId: input.ownerId,
    resourceType: "asset",
    payload: jsonStringifyOr({ assetId: input.assetId, contentHash: input.contentHash, },),
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
