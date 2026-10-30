// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/resource-provider.ts — thin routing facade (epic-resource-provision).
//
// callWithResource: resolveResource -> enforceQuota -> routeToProvider
// (delegates to registry.ts + callWithFailover) -> recordUsage. Quota breach
// rejects with QuotaExceededError BEFORE any provider call. Later tickets add
// external inference/storage UX, browser backup, and reconciliation on top.

import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { callWithFailover, } from "./providers/call-with-failover";
import { buildFailoverList, resolveProvider, } from "./providers/registry";
import type { GenerateRequest, GenerateResponse, } from "./providers/types";
import { parseQuota, QuotaEngine, type ResourceQuota, } from "./quota-engine";

/** A resolvable provisioned resource row. */
export interface ResourceRecord {
  id: string;
  ownerId: string;
  type: string;
  provider: string;
  endpoint: string;
  credentialRef: string;
  quota: ResourceQuota;
  status: string;
}

export interface CallWithResourceOpts {
  db?: Kysely<DB> | null;
  config: Config;
  userId?: string;
  /** Inject a shared engine (tests); defaults to a fresh memory-only one. */
  quota?: QuotaEngine;
}

interface ResourceRow {
  id: string;
  owner_id: string;
  type: string;
  provider: string;
  endpoint: string;
  credential_ref: string;
  quota: string;
  status: string;
}

/** Fetch one resource record and parse its quota envelope. */
export async function resolveResource(db: Kysely<DB>, resourceId: string,): Promise<ResourceRecord> {
  const row = await db
    .selectFrom("resource_records",)
    .select(["id", "owner_id", "type", "provider", "endpoint", "credential_ref", "quota", "status",],)
    .where("id", "=", resourceId,)
    .executeTakeFirst() as ResourceRow | undefined;

  if (!row) { throw new Error(`Unknown resource "${resourceId}"`,); }
  return {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type,
    provider: row.provider,
    endpoint: row.endpoint,
    credentialRef: row.credential_ref,
    quota: parseQuota(row.quota, row.id,),
    status: row.status,
  };
}

/**
 * Dispatch a generation request through a provisioned resource: active-status
 * check, quota pre-call guard, registry routing, post-call accounting.
 * @param resourceId - provisioned resource to route through
 * @param req - generation request
 * @param opts - db handle, config, optional shared quota engine
 * @returns provider response
 */
export async function callWithResource(
  resourceId: string,
  req: GenerateRequest,
  opts: CallWithResourceOpts,
): Promise<GenerateResponse> {
  const record = opts.db ? await resolveResource(opts.db, resourceId,) : fallbackRecord(resourceId,);
  if (record.status !== "active") {
    throw new Error(`Resource "${resourceId}" is ${record.status}`,);
  }

  const quota = opts.quota ?? new QuotaEngine({ db: opts.db ?? null, },);
  await quota.consumeRequest(record.id, record.quota,);
  const resolved = await resolveProvider({
    provider: record.provider,
    model: req.model,
    userId: opts.userId,
    config: opts.config,
    db: opts.db ?? undefined,
  },);

  // Compose, not replace: the registry owns resolution order and failover;
  // the facade only guards quota before and accounts usage after.
  const callList = buildFailoverList(resolved.resolvedProviderName, opts.config,);
  const response = await callWithFailover(callList, { ...req, apiKey: req.apiKey ?? resolved.resolvedApiKey, },);
  await quota.recordTokenUsage(record.id, response.usage?.totalTokens ?? 0,);
  if (opts.db) {
    await opts.db
      .updateTable("resource_records",)
      .set({ last_used_at: new Date().toISOString(), },)
      .where("id", "=", record.id,)
      .execute();
  }

  return response;
}

/** Offline path: no DB handle means no stored record, so route by provider name. */
function fallbackRecord(resourceId: string,): ResourceRecord {
  return {
    id: resourceId,
    ownerId: "",
    type: "inference",
    provider: resourceId,
    endpoint: "",
    credentialRef: "",
    quota: { requestsPerMinute: 0, },
    status: "active",
  };
}
