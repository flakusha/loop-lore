// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 394
// Cohesive single-purpose storage+backup service for epic-resource-provision.
// src/resource/external-storage.ts — provisioned external storage endpoints
// (S3-compatible, WebDAV) plus hash-checked browser backups.
//
// Secrets pass through credential-store (one-way ref only, never plaintext).
// Backup writes land in `backup_records` with a SHA-256 content hash; the
// read path re-hashes and rejects mismatches. Storage-bytes quotas reject
// BEFORE the write. Scheduling hooks (chat end, asset upload, world save)
// are registered no-op callbacks — the scheduler surface owns invocation;
// this module never invents a scheduler.

import type { Kysely, } from "kysely";
import { createHash, randomUUID, } from "node:crypto";
import type { DB, } from "../db/schema";
import { QuotaExceededError, } from "../generation/quota-engine";
import { jsonStringifyOr, safeJsonParse, } from "../utils";
import { storeCredential, } from "./credential-store";
import { ResourceUnavailableError, type ResourceUnavailableReason, } from "./external-inference";

/** Supported external storage endpoint kinds. */
export type StorageKind = "s3" | "webdav";

/** Public view of a provisioned storage resource (no secret material).
 * `credentialRef` is intentionally absent: even the one-way ref leaks
 * account-linkable material, so HTTP responses never carry it. */
export interface StorageResource {
  id: string;
  ownerId: string;
  kind: StorageKind;
  endpoint: string;
  storageQuotaBytes: number;
  status: string;
}

/** Options for registering a storage endpoint. */
export interface AddStorageOpts {
  /** Stable id; generated when omitted. */
  id?: string;
  ownerId: string;
  kind: StorageKind;
  endpoint: string;
  /** Raw secret — hashed/wrapped, never persisted. */
  secret: string;
  wrapSecret?: string;
  /** Byte ceiling for backups under this destination (0 = unlimited). */
  storageQuotaBytes?: number;
}

/** A stored backup row (payload included; callers decide what to expose). */
export interface BackupRecord {
  id: string;
  resourceType: string;
  ownerId: string;
  contentHash: string;
  serverHash: string | null;
  payload: string;
  version: number;
  storageQuotaBytes: number;
}

/** Options for writing a backup blob. */
export interface WriteBackupOpts {
  /** Stable id; generated when omitted. */
  id?: string;
  resourceType: string;
  ownerId: string;
  payload: string;
  /** Byte ceiling for this owner+type scope (0 = unlimited). */
  storageQuotaBytes?: number;
}

/** Rejection when a stored payload no longer matches its content hash. */
export class HashMismatchError extends Error {
  readonly backupId: string;
  constructor(backupId: string,) {
    super(`Backup "${backupId}" failed integrity check: content hash mismatch`,);
    this.name = "HashMismatchError";
    this.backupId = backupId;
  }
}

/** Dry-run probe result: no outbound call is ever made. */
export type StorageTestResult =
  | { ok: true; resource: StorageResource }
  | { ok: false; reason: ResourceUnavailableReason; fallback: string };

const TYPE_PREFIX = "storage:";
const KINDS: StorageKind[] = ["s3", "webdav",];

interface StorageRow {
  id: string;
  owner_id: string;
  type: string;
  endpoint: string;
  credential_ref: string;
  quota: string;
  status: string;
}

interface BackupRow {
  id: string;
  resource_type: string;
  owner_id: string;
  content_hash: string;
  server_hash: string | null;
  payload: string;
  version: number;
  storage_quota_bytes: number;
}

const COLUMNS = ["id", "owner_id", "type", "endpoint", "credential_ref", "quota", "status",] as const;
const BACKUP_COLUMNS = [
  "id",
  "resource_type",
  "owner_id",
  "content_hash",
  "server_hash",
  "payload",
  "version",
  "storage_quota_bytes",
] as const;

/** SHA-256 hex of a backup payload — the integrity-check primitive. */
export function hashContent(payload: string,): string {
  return createHash("sha256",).update(payload, "utf8",).digest("hex",);
}

function storageQuotaOf(raw: string,): number {
  const parsed = safeJsonParse<{ storageQuotaBytes?: unknown }>(raw,);
  if (!parsed.ok || typeof parsed.value.storageQuotaBytes !== "number") { return 0; }
  return Math.max(0, parsed.value.storageQuotaBytes,);
}

function toPublic(row: StorageRow,): StorageResource {
  return {
    id: row.id,
    ownerId: row.owner_id,
    kind: row.type.slice(TYPE_PREFIX.length,) as StorageKind,
    endpoint: row.endpoint,
    storageQuotaBytes: storageQuotaOf(row.quota,),
    status: row.status,
  };
}

function toBackup(row: BackupRow,): BackupRecord {
  return {
    id: row.id,
    resourceType: row.resource_type,
    ownerId: row.owner_id,
    contentHash: row.content_hash,
    serverHash: row.server_hash,
    payload: row.payload,
    version: row.version,
    storageQuotaBytes: row.storage_quota_bytes,
  };
}

/**
 * Register a storage endpoint. The secret is hashed/wrapped via
 * credential-store; only the ref lands in `resource_records`.
 */
export async function addStorageResource(db: Kysely<DB>, opts: AddStorageOpts,): Promise<StorageResource> {
  if (!KINDS.includes(opts.kind,)) { throw new Error(`Unknown storage kind "${opts.kind}"`,); }
  if (!opts.ownerId || !opts.endpoint) { throw new Error("ownerId and endpoint are required",); }
  const persistedSecretRef = await storeCredential(opts.secret, opts.wrapSecret,);
  const storageQuotaBytes = Math.max(0, opts.storageQuotaBytes ?? 0,);
  const id = opts.id ?? randomUUID();
  await db
    .insertInto("resource_records",)
    .values({
      id,
      owner_id: opts.ownerId,
      type: `${TYPE_PREFIX}${opts.kind}`,
      provider: opts.kind,
      endpoint: opts.endpoint,
      credential_ref: persistedSecretRef,
      quota: jsonStringifyOr({ requestsPerMinute: 0, storageQuotaBytes, },),
      status: "active",
    },)
    .execute();

  return {
    id,
    ownerId: opts.ownerId,
    kind: opts.kind,
    endpoint: opts.endpoint,
    storageQuotaBytes,
    status: "active",
  };
}

/** List provisioned storage endpoints, optionally scoped to an owner. */
export async function listStorageResources(db: Kysely<DB>, ownerId?: string,): Promise<StorageResource[]> {
  let query = db.selectFrom("resource_records",).select(COLUMNS,).where("type", "like", `${TYPE_PREFIX}%`,);
  if (ownerId !== undefined) { query = query.where("owner_id", "=", ownerId,); }
  const rows = await query.execute() as StorageRow[];
  return rows.map(toPublic,);
}

/** Revoke an endpoint: status tombstone, so the guard blocks resolution. */
export async function revokeStorageResource(db: Kysely<DB>, resourceId: string,): Promise<void> {
  const updated = await db
    .updateTable("resource_records",)
    .set({ status: "revoked", },)
    .where("id", "=", resourceId,)
    .where("type", "like", `${TYPE_PREFIX}%`,)
    .executeTakeFirst();

  if (updated.numUpdatedRows === 0n) { throw new Error(`Unknown resource "${resourceId}"`,); }
}

/**
 * Pre-use guard: active-status check only (storage has no request quota;
 * bytes are enforced per backup write). Rejects before any outbound call.
 */
export async function checkStorageAvailable(db: Kysely<DB>, resourceId: string,): Promise<StorageResource> {
  const row = await db
    .selectFrom("resource_records",)
    .select(COLUMNS,)
    .where("id", "=", resourceId,)
    .executeTakeFirst() as StorageRow | undefined;

  if (!row || !row.type.startsWith(TYPE_PREFIX,)) {
    throw new ResourceUnavailableError(resourceId, "unknown", "using local backup fallback.",);
  }

  if (row.status !== "active") {
    const reason = row.status === "paused" ? "paused" : "revoked";
    throw new ResourceUnavailableError(resourceId, reason, "using local backup fallback.",);
  }

  return toPublic(row,);
}

/** Dry-run probe for admin UX: guard outcome as data, never a call-out. */
export async function testStorageResource(db: Kysely<DB>, resourceId: string,): Promise<StorageTestResult> {
  try {
    return { ok: true, resource: await checkStorageAvailable(db, resourceId,), };
  } catch (error) {
    if (error instanceof ResourceUnavailableError) {
      return { ok: false, reason: error.reason, fallback: error.fallback, };
    }

    throw error;
  }
}

// Serializes concurrent writers on one connection: quota-sum check + insert
// run inside a single transaction, so two racing writers cannot both pass.
let backupWriteChain: Promise<void> = Promise.resolve();

/**
 * Write a backup blob with a content hash. Enforces the storage-bytes quota
 * (summed over the owner+type scope) BEFORE the insert; rejects on overflow.
 * The quota check runs inside the same transaction as the insert, and
 * concurrent writers queue behind a module mutex so one connection never
 * holds overlapping transactions.
 * // ponytail: in-process mutex, not a distributed lock — correct for the
 * // single-writer sqlite hosts this module targets; revisit for multi-node.
 */
export async function writeBackup(db: Kysely<DB>, opts: WriteBackupOpts,): Promise<BackupRecord> {
  if (!opts.ownerId || !opts.resourceType) { throw new Error("ownerId and resourceType are required",); }
  const quotaBytes = Math.max(0, opts.storageQuotaBytes ?? 0,);
  const id = opts.id ?? randomUUID();
  const contentHash = hashContent(opts.payload,);
  const incomingBytes = Buffer.byteLength(opts.payload, "utf8",);

  // Already inside a transaction (e.g. restoreBackupForOwner's audit write):
  // Kysely rejects nested db.transaction() on a Transaction handle, so run
  // the body directly — the outer tx is the serialization boundary.
  if (db.isTransaction) {
    return runWrite(db,);
  }

  const prior = backupWriteChain;
  const gate = Promise.withResolvers<void>();
  backupWriteChain = gate.promise;
  await prior;
  try {
    return await db.transaction().execute((tx,) => runWrite(tx as unknown as Kysely<DB>,));
  } finally {
    gate.resolve();
  }

  async function runWrite(executor: Kysely<DB>,): Promise<BackupRecord> {
    if (quotaBytes > 0) {
      const existing = await executor
        .selectFrom("backup_records",)
        .select("payload",)
        .where("owner_id", "=", opts.ownerId,)
        .where("resource_type", "=", opts.resourceType,)
        .execute();

      const used = existing.reduce((sum, row,) => sum + Buffer.byteLength(row.payload, "utf8",), 0,);
      if (used + incomingBytes > quotaBytes) {
        throw new QuotaExceededError({
          resourceId: `${opts.ownerId}:${opts.resourceType}`,
          kind: "storage-bytes",
          limit: quotaBytes,
        },);
      }
    }

    await executor
      .insertInto("backup_records",)
      .values({
        id,
        resource_type: opts.resourceType,
        owner_id: opts.ownerId,
        content_hash: contentHash,
        server_hash: contentHash,
        payload: opts.payload,
        version: 1,
        storage_quota_bytes: quotaBytes,
      },)
      .execute();

    return {
      id,
      resourceType: opts.resourceType,
      ownerId: opts.ownerId,
      contentHash,
      serverHash: contentHash,
      payload: opts.payload,
      version: 1,
      storageQuotaBytes: quotaBytes,
    };
  }
}

/**
 * Integrity check: re-hash the stored payload and compare with `content_hash`.
 * Throws HashMismatchError on tamper/corruption, Error on unknown id.
 */
export async function verifyBackupIntegrity(db: Kysely<DB>, backupId: string,): Promise<BackupRecord> {
  const row = await db
    .selectFrom("backup_records",)
    .select(BACKUP_COLUMNS,)
    .where("id", "=", backupId,)
    .executeTakeFirst() as BackupRow | undefined;

  if (!row) { throw new Error(`Unknown backup "${backupId}"`,); }
  if (hashContent(row.payload,) !== row.content_hash) { throw new HashMismatchError(backupId,); }
  return toBackup(row,);
}

// No production rotation constant exists (rotateBackups is browser-pure and
// test-only); the scheduler default below is 10 per owner+type scope.
export const BACKUP_PRUNE_KEEP_DEFAULT = 10;

export interface PruneBackupsOpts {
  ownerId: string;
  resourceType: string;
  keep?: number;
}

/**
 * Bounded rotation prune: delete every backup row for an owner+type scope
 * except the latest `keep` by version desc, created_at desc, id asc.
 * Returns 0 (no-op) when keep <= 0 or the scope already fits — call after
 * a persist.
 */
export async function pruneBackups(db: Kysely<DB>, opts: PruneBackupsOpts,): Promise<number> {
  const keep = opts.keep ?? BACKUP_PRUNE_KEEP_DEFAULT;
  if (keep <= 0) { return 0; }
  const rows = await db
    .selectFrom("backup_records",)
    .select(["id", "version", "created_at",],)
    .where("owner_id", "=", opts.ownerId,)
    .where("resource_type", "=", opts.resourceType,)
    .execute();

  if (rows.length <= keep) { return 0; }
  const ordered = [...rows,].sort((a, b,) =>
    b.version - a.version || String(b.created_at,).localeCompare(String(a.created_at,),) || a.id.localeCompare(b.id,)
  );

  const stale = ordered.slice(keep,);
  const ids = stale.map((row,) => row.id);
  const deleted = await db
    .deleteFrom("backup_records",)
    .where("id", "in", ids,)
    .executeTakeFirst();

  return Number(deleted.numDeletedRows ?? 0n,);
}

/** List stored backups, optionally scoped to an owner and resource type. */
export async function listBackups(db: Kysely<DB>, ownerId?: string, resourceType?: string,): Promise<BackupRecord[]> {
  let query = db.selectFrom("backup_records",).select(BACKUP_COLUMNS,);
  if (ownerId !== undefined) { query = query.where("owner_id", "=", ownerId,); }
  if (resourceType !== undefined) { query = query.where("resource_type", "=", resourceType,); }
  const rows = await query.execute() as BackupRow[];
  return rows.map(toBackup,);
}

/** What the owner chose to restore into (chat store, asset dir, …). */
export interface BackupRestoreTarget {
  applyPayload(resourceId: string, data: unknown,): void | Promise<void>;
}

export interface OwnerRestoreResult {
  restored: boolean;
  reason: string;
}

/**
 * Owner-scoped restore: verify the backup belongs to `ownerId`, re-hash its
 * payload, parse it, apply it to `target`, and record the recovery source
 * as a fresh backup row. Non-owners get restored:false (route maps to 403);
 * `confirmed:false` refuses with zero applies so the dashboard confirm gate
 * stays meaningful. The target apply runs inside one transaction with the
 * recovery-source write, so a failed apply rolls back the audit row.
 */
export async function restoreBackupForOwner(
  db: Kysely<DB>,
  ownerId: string,
  backupId: string,
  confirmed: boolean,
  target: BackupRestoreTarget,
): Promise<OwnerRestoreResult> {
  const backup = await verifyBackupIntegrity(db, backupId,).catch(() => null);
  if (!backup) { return { restored: false, reason: "backup not found or integrity check failed", }; }
  if (backup.ownerId !== ownerId) { return { restored: false, reason: "not owner", }; }
  if (!confirmed) { return { restored: false, reason: "recovery requires explicit user confirmation", }; }
  const parsed = safeJsonParse<unknown>(backup.payload,);
  if (!parsed.ok) { return { restored: false, reason: "integrity check failed: payload is not valid JSON", }; }
  const data: unknown = parsed.value;

  const record = (data ?? {}) as Record<string, unknown>;
  const resourceId = ["chatId", "assetId", "messageId", "worldId", "resourceId", "restoredFrom", "loreId",]
    .map((key,) => record[key])
    .find((value,): value is string => typeof value === "string" && value.length > 0) ?? backup.id;

  await db.transaction().execute(async (tx,) => {
    await target.applyPayload(resourceId, data,);
    await writeBackup(tx as unknown as Kysely<DB>, {
      ownerId,
      resourceType: backup.resourceType,
      payload: jsonStringifyOr({ restoredFrom: backup.id, resourceId, },),
    },);
  },);

  return { restored: true, reason: `restored ${resourceId} v${backup.version}`, };
}

/** Backup trigger input shared by all scheduling hooks. */
export interface BackupTrigger {
  ownerId: string;
  resourceType: string;
  payload: string;
  storageQuotaBytes?: number;
}

/** A backup scheduling hook: persist (or forward) one backup blob. */
export type BackupHook = (db: Kysely<DB>, trigger: BackupTrigger,) => Promise<void>;

/** Default persisting hook implementation schedulers can register. */
export async function persistBackupHook(db: Kysely<DB>, trigger: BackupTrigger,): Promise<void> {
  await writeBackup(db, trigger,);
}

const noopHook: BackupHook = async () => {/* scheduler surface invokes hooks; default is intentionally inert */};

/**
 * Scheduling hooks (chat end, asset upload, world save). Registered no-ops by
 * default — the scheduler surface owns invocation; call registerBackupHook
 * to wire persistence. This module never invents a scheduler.
 */
export const backupHooks = {
  onChatEnd: noopHook,
  onAssetUpload: noopHook,
  onWorldSave: noopHook,
} satisfies Record<string, BackupHook>;

/** Wire a persistence implementation into one scheduling hook. */
export function registerBackupHook(name: keyof typeof backupHooks, fn: BackupHook,): void {
  backupHooks[name] = fn;
}
