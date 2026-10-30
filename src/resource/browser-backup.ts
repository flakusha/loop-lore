// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/resource/browser-backup.ts — opt-in browser backup export/import.
//
// Pure and testable without a browser: storage hides behind KeyValueStore
// (a localStorage/IndexedDB adapter supplied by the caller), so no browser
// APIs are touched at module top level. Hashing uses node:crypto, the same
// primitive as credential-store.ts. See epic-resource-provision.md
// (BackupRecord shape + reconciliation table).

import { createHash, } from "node:crypto";
import { jsonStringifyOr, safeJsonParse, } from "../utils";

/** Backup payload kinds from the epic BackupRecord. */
export type BackupResourceType = "chat" | "asset" | "world" | "lore";

/**
 * Epic BackupRecord. `id` is
 * `ll-backup::<ownerId>::<resourceId>::<version>::<hash>`.
 */
export interface BackupRecord {
  id: string;
  resourceType: BackupResourceType;
  ownerId: string;
  resourceId: string;
  contentHash: string;
  serverHash?: string;
  payload: string;
  version: number;
  createdAt: string;
}

/** Minimal storage seam — implemented by localStorage/IndexedDB adapters. */
export interface KeyValueStore {
  getItem(key: string,): string | null | Promise<string | null>;
  setItem(key: string, value: string,): void | Promise<void>;
}

/** SHA-256 hex of a payload string. */
export function hashPayload(payload: string,): string {
  return createHash("sha256",).update(payload, "utf8",).digest("hex",);
}

/** Storage key for a backup: `ll-backup::<ownerId>::<resourceId>::<version>::<hash>`. */
export function backupKey(
  ownerId: string,
  resourceId: string,
  version: number,
  contentHash: string,
): string {
  return `ll-backup::${ownerId}::${resourceId}::${version}::${contentHash}`;
}

export interface CreateBackupInput {
  ownerId: string;
  resourceId: string;
  resourceType: BackupResourceType;
  /** Serializable data (chats, asset metadata, world snapshots). */
  data: unknown;
  version?: number;
  createdAt?: string;
}

/**
 * Serialize data to a hashed BackupRecord (no I/O).
 * @throws {Error} when ownerId or resourceId is empty
 */
export function createBackup(input: CreateBackupInput,): BackupRecord {
  if (!input.ownerId) { throw new Error("ownerId must be non-empty",); }
  if (!input.resourceId) { throw new Error("resourceId must be non-empty",); }
  const version = input.version ?? 1;
  const payload = jsonStringifyOr(input.data,);
  const contentHash = hashPayload(payload,);
  return {
    id: backupKey(input.ownerId, input.resourceId, version, contentHash,),
    resourceType: input.resourceType,
    ownerId: input.ownerId,
    resourceId: input.resourceId,
    contentHash,
    payload,
    version,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

/** Persist a record; resolves to its storage key. */
export async function exportBackup(store: KeyValueStore, record: BackupRecord,): Promise<string> {
  await store.setItem(record.id, jsonStringifyOr(record,),);
  return record.id;
}

/**
 * Load a record and re-verify its hash.
 * @throws {Error} when the key is missing, unparseable, or tampered with.
 */
export async function importBackup(store: KeyValueStore, key: string,): Promise<BackupRecord> {
  const raw = await store.getItem(key,);
  if (raw === null) { throw new Error(`no backup stored at ${key}`,); }
  let record: BackupRecord;
  const parsed = safeJsonParse<BackupRecord>(raw,);
  if (!parsed.ok) {
    throw new Error(`backup at ${key} is not valid JSON`,);
  }

  record = parsed.value;

  if (!verifyBackup(record,)) { throw new Error(`backup at ${key} failed integrity check (content hash mismatch)`,); }
  return record;
}

/** Re-hash the stored blob and compare against the recorded hash. */
export function verifyBackup(record: BackupRecord,): boolean {
  if (!record || typeof record.payload !== "string" || typeof record.contentHash !== "string") {
    return false;
  }

  return hashPayload(record.payload,) === record.contentHash;
}
