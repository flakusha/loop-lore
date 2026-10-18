// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/storage-eviction.ts — opt-in, archive-first, oldest-first
// quota eviction.
//
// Two invariants the sweep never breaks:
//   1. An asset referenced by a LIVE chat message is never a candidate. A
//      sweep that deletes one breaks a conversation, so `asset_links` rows
//      with `archived_at IS NULL` on a chat/message are an absolute veto.
//   2. The budget is never exceeded to make room. When nothing is evictable
//      the caller refuses the write; this sweep returns `freedBytes: 0`.
//
// Audit: one `log_entries` row per eviction, naming the asset, its bytes and
// the reason — the same shape a manual deletion leaves, so a restore can
// explain the gap (epic-federation-offload-quotas §4).

import { type Kysely, sql, } from "kysely";
import { deleteAsset, } from "../assets/service/delete";
import { AssetLinkEntity, type StorageBudgetScope, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";

/** Lazy: a bare import must not throw when no root logger exists yet. */
const getLog = () => getChildLogger("federation/storage-eviction",);

/** Why an asset was chosen — the first tier to yield bytes wins. */
const EVICTION_REASON_ARCHIVED = "archived-unreferenced";
const EVICTION_REASON_ORPHAN = "unreferenced";

/** Link entities whose un-archived link blocks eviction outright. */
const LIVE_LINK_ENTITIES = [AssetLinkEntity.Chat, AssetLinkEntity.Message,] as const;

/** One asset the sweep removed. */
export interface EvictedAsset {
  assetId: string;
  filename: string;
  bytes: number;
  reason: string;
}

/** Outcome of one sweep. */
export interface EvictionSweepResult {
  evicted: EvictedAsset[];
  freedBytes: number;
}

/** Asset row as the sweep consumes it. */
interface EvictionCandidate {
  id: string;
  filename: string;
  size_bytes: number;
  archived_link_count: number;
}

/**
 * Ordered eviction candidates: archived-linked first, then unreferenced, each
 * oldest-first. The live-chat veto is a NOT EXISTS so a protected asset never
 * reaches the caller.
 * @param opts
 * @param opts.database
 * @param opts.scope Budget scope whose assets are eligible; `total` = every class.
 * @param opts.limit Bounded candidate page.
 * @returns {Promise<EvictionCandidate[]>}
 */
async function evictionCandidates({
  database,
  scope,
  limit,
}: {
  database: Kysely<DB>;
  scope: StorageBudgetScope;
  limit: number;
},): Promise<EvictionCandidate[]> {
  const archivedLinkCount = sql<number>`count(${sql.ref("asset_links.asset_id",)}) filter (where ${
    sql.ref("asset_links.archived_at",)
  } is not null)`;

  const base = database
    .selectFrom("assets",)
    .select([
      "assets.id",
      "assets.filename",
      "assets.size_bytes",
      archivedLinkCount.as("archived_link_count",),
    ],)
    .leftJoin("asset_links", "asset_links.asset_id", "assets.id",)
    .where(({ not, exists, selectFrom, },) =>
      not(exists(
        selectFrom("asset_links",)
          .select("asset_links.asset_id",)
          .whereRef("asset_links.asset_id", "=", "assets.id",)
          .where("asset_links.archived_at", "is", null,)
          .where("asset_links.entity_type", "in", [...LIVE_LINK_ENTITIES,],),
      ),)
    );

  const scoped = scope === "total" ? base : base.where("assets.asset_type", "=", scope,);
  return scoped
    .groupBy(["assets.id",],)
    .orderBy(sql`${archivedLinkCount} desc`,)
    .orderBy("assets.created_at", "asc",)
    .limit(limit,)
    .execute();
}

/**
 * Run one eviction sweep for a scope.
 * @param opts
 * @param opts.database
 * @param opts.uploadDir Asset root, for the file unlink.
 * @param opts.scope
 * @param opts.neededBytes Stop once this much has been freed.
 * @param opts.limit Bounded candidate page (default 100).
 * @returns {Promise<EvictionSweepResult>}
 */
export async function runEvictionSweep({
  database,
  uploadDir,
  scope,
  neededBytes,
  limit = 100,
}: {
  database: Kysely<DB>;
  uploadDir: string;
  scope: StorageBudgetScope;
  neededBytes: number;
  limit?: number;
},): Promise<EvictionSweepResult> {
  const candidates = await evictionCandidates({ database, scope, limit, },);
  const evicted: EvictedAsset[] = [];
  let freedBytes = 0;

  for (const candidate of candidates) {
    if (freedBytes >= neededBytes) { break; }
    const bytes = Number(candidate.size_bytes,);
    const reason = candidate.archived_link_count > 0 ? EVICTION_REASON_ARCHIVED : EVICTION_REASON_ORPHAN;

    const removed = await deleteAsset({ database, assetId: candidate.id, uploadDir, },);
    if (!removed) { continue; }

    freedBytes += bytes;
    evicted.push({ assetId: candidate.id, filename: candidate.filename, bytes, reason, },);
    await writeEvictionAudit(database, { assetId: candidate.id, bytes, reason, },);
  }

  getLog()?.info("storage eviction sweep complete", {
    scope,
    neededBytes,
    evicted: evicted.length,
    freedBytes,
  },);

  return { evicted, freedBytes, };
}

/**
 * Audit one eviction. Names the asset, its bytes and the reason so a restore
 * can explain the gap.
 * @param database
 * @param entry
 * @returns {Promise<void>}
 */
async function writeEvictionAudit(
  database: Kysely<DB>,
  entry: { assetId: string; bytes: number; reason: string },
): Promise<void> {
  const serialized = safeJsonStringify({ asset_id: entry.assetId, bytes: entry.bytes, reason: entry.reason, },);
  const nowIso = new Date().toISOString();
  await database
    .insertInto("log_entries",)
    .values({
      id: crypto.randomUUID(),
      level: 30,
      timestamp: Date.now(),
      time: nowIso,
      message: "Storage quota eviction removed an asset",
      module: "federation-storage",
      user_id: null,
      meta: serialized.ok ? serialized.value : "{}",
      event_type: "federation.storage.evicted",
      entity_type: "asset",
      entity_id: entry.assetId,
      action: entry.reason,
      created_at: nowIso,
    },)
    .execute();
}
