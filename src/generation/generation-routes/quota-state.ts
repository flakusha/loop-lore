// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Quota-state read + admin override for the settings quota gauge
// (epic-resource-provision quota UI slice).
//
// GET state serves the per-resource gauge: ceiling from the resource record's
// `quota` JSON envelope, used from `resource_quota_counters`. POST override
// resets a resource's window counters — admin-only, mirroring the
// `admin.settings` gate on the admin-template surface.
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { restoreBackupForOwner, } from "../../resource/external-storage";
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../../routes/http-utils";
import { can, } from "../../users/permissions";
import { safeJsonParse, } from "../../utils";
import { parseQuota, } from "../quota-engine";

/** One gauge dimension: used vs ceiling (null = unlimited). */
export interface QuotaDimensionState {
  key: string;
  used: number;
  ceiling: number | null;
}

/** Gauge state for one provisioned resource. */
export interface QuotaResourceState {
  id: string;
  provider: string;
  type: string;
  status: string;
  overQuota: boolean;
  dimensions: QuotaDimensionState[];
}

/**
 * GET /api/v1/generation/quota-state
 *
 * Per-resource quota gauge state. Owners see their own resources;
 * `admin.settings` holders see all (and learn they may override).
 * @param database
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleQuotaState(
  database: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }

  const isAdmin = can(userRole ?? null, "admin.settings",);
  let query = database
    .selectFrom("resource_records",)
    .select(["id", "owner_id", "type", "provider", "status", "quota",],);

  if (!isAdmin) { query = query.where("owner_id", "=", authUserId,); }
  const rows = await query.execute();

  const ids = rows.map((r,) => r.id);
  const counterById = new Map<string, { requests: number; tokens: number }>();
  if (ids.length > 0) {
    const counters = await database
      .selectFrom("resource_quota_counters",)
      .select(["resource_id", "requests", "tokens",],)
      .where("resource_id", "in", ids,)
      .execute();

    for (const c of counters) {
      counterById.set(c.resource_id, { requests: c.requests, tokens: c.tokens, },);
    }
  }

  const resources: QuotaResourceState[] = rows.map((row,) => {
    const quota = parseQuota(row.quota, row.id,);
    const used = counterById.get(row.id,) ?? { requests: 0, tokens: 0, };
    const dimensions: QuotaDimensionState[] = [
      {
        key: "requests",
        used: used.requests,
        ceiling: quota.requestsPerMinute > 0 ? quota.requestsPerMinute : null,
      },
      {
        key: "tokens",
        used: used.tokens,
        ceiling: quota.tokensPerMinute !== undefined && quota.tokensPerMinute > 0
          ? quota.tokensPerMinute
          : null,
      },
    ];

    const overQuota = dimensions.some((d,) => d.ceiling !== null && d.used >= d.ceiling);
    return {
      id: row.id,
      provider: row.provider,
      type: row.type,
      status: row.status,
      overQuota,
      dimensions,
    };
  },);

  return jsonResponse({ resources, isAdmin, },);
}

/**
 * POST /api/v1/generation/quota/override
 *
 * Admin-only: reset one resource's window counters (the settings UI's
 * "override" control). Body: `{ resourceId: string }`.
 * @param body
 * @param database
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleQuotaOverride(
  body: unknown,
  database: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }
  if (!can(userRole ?? null, "admin.settings",)) {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
  }

  const resourceId = (body as Record<string, unknown> | null)?.resourceId;
  if (typeof resourceId !== "string" || !resourceId) {
    return jsonError({ message: "resourceId is required", status: HttpStatus.BadRequest, },);
  }

  await database.deleteFrom("resource_quota_counters",).where("resource_id", "=", resourceId,).execute();
  return jsonResponse({ ok: true, resourceId, },);
}

/** One server-side backup entry: keyed per backup so multiple backups of
 * one resource_type/owner (e.g. two chats) never collapse into one row.
 * `resourceId` is parsed out of the stored payload (`{ chatId }`,
 * `{ assetId }`, …) when present; otherwise it falls back to the backup
 * `id` so the dashboard always has a stable per-row key. */
export interface BackupHashEntry {
  id: string;
  resourceType: string;
  resourceId: string;
  serverHash: string;
  serverVersion: number;
}

/** Best-effort resource id from a stored backup payload: the schedulers
 * persist `{ chatId }`, `{ assetId, contentHash }`, or a raw snapshot.
 * Unknown shapes fall back to the backup id. */
export function backupResourceId(payload: string, fallbackId: string,): string {
  const parsed = safeJsonParse<Record<string, unknown> | null>(payload,);
  if (parsed.ok && parsed.value && typeof parsed.value === "object") {
    for (const key of ["chatId", "assetId", "resourceId", "worldId", "loreId",]) {
      const value = parsed.value[key];
      if (typeof value === "string" && value.length > 0) { return value; }
    }
  }

  return fallbackId;
}

/**
 * GET /api/v1/settings/backups/hashes
 *
 * Server-side hashes for the settings backup dashboard: the caller
 * reconciles its local backup copies against these content hashes.
 * Owners see only their own backups; `admin.settings` holders see all
 * (mirrors the scoping of handleQuotaState).
 *
 * Response shape: `{ hashes: Record<backupId, BackupHashEntry> }` keyed by
 * the server backup `id` (stable across owners/types). The legacy
 * `resource_type:owner_id` key collapsed every owner's same-type backups
 * into the last row — clients key reconcile lookups per backup instead.
 */
export async function handleBackupHashes(
  database: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }

  const isAdmin = can(userRole ?? null, "admin.settings",);
  let query = database
    .selectFrom("backup_records",)
    .select(["id", "resource_type", "owner_id", "content_hash", "version", "payload",],);

  if (!isAdmin) { query = query.where("owner_id", "=", authUserId,); }
  const rows = await query.execute();

  const hashes: Record<string, BackupHashEntry> = {};
  for (const row of rows) {
    hashes[row.id] = {
      id: row.id,
      resourceType: row.resource_type,
      resourceId: backupResourceId(row.payload, row.id,),
      serverHash: row.content_hash,
      serverVersion: row.version,
    };
  }

  return jsonResponse({ hashes, },);
}

/**
 * POST /api/v1/settings/backups/:id/restore
 *
 * User-scoped one-click recovery behind explicit confirmation: verifies the
 * backup belongs to the caller and re-hashes its payload, then records the
 * recovery as a fresh audit row. There is no server-side apply surface for
 * browser-local state, so the target is a no-op — the browser already holds
 * the payload (fetched via the hashes endpoint) and applies it locally.
 *
 * Non-owners get restored:false (403); `confirm:true` missing gets 400
 * without touching any row, so the dashboard confirm gate stays meaningful.
 * @param body
 * @param backupId
 * @param database
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleBackupRestore(
  body: unknown,
  backupId: string,
  database: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }

  const confirmed = (body as Record<string, unknown> | null)?.confirm === true;
  if (!confirmed) {
    return jsonError({ message: "confirm is required", status: HttpStatus.BadRequest, },);
  }

  void userRole;
  const result = await restoreBackupForOwner(
    database,
    authUserId,
    backupId,
    true,
    { applyPayload: () => {/* no server-side apply: the browser holds the payload */}, },
  );

  if (!result.restored && result.reason === "not owner") {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, },);
  }

  if (!result.restored) {
    return jsonError({ message: result.reason, status: HttpStatus.NotFound, },);
  }

  return jsonResponse({ ok: true, reason: result.reason, },);
}
