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
import { HttpStatus, jsonError, jsonResponse, requireUserId, } from "../../routes/http-utils";
import { can, } from "../../users/permissions";
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
