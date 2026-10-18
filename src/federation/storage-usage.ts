// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/federation/storage-usage.ts — DB-authoritative byte accounting.
//
// The DB is the source of truth: `assets.size_bytes` is NOT NULL
// (`src/db/schema-content.ts`) and open `mesh_reservations` rows hold inbound
// bytes before the payload lands. Disk is what gets reconciled AGAINST (see
// ./storage-reconcile), never the source of a number — so every read here is a
// pair of aggregate queries and no filesystem walk.

import { type Kysely, sql, } from "kysely";
import { AssetType, type StorageBudgetScope, type StorageEvictionPolicy, } from "../db/enums";
import type { DB, } from "../db/schema";
import { OPEN_RESERVATION_STATES, } from "./sharing";

/** Byte totals for one budget scope. */
export interface StorageUsage {
  /** `SUM(assets.size_bytes)` over the scope. */
  assetBytes: number;
  /** `SUM(mesh_reservations.size_bytes)` over open reservations. */
  heldBytes: number;
  /** `assetBytes + heldBytes` — the figure every limit is compared against. */
  totalBytes: number;
  /** `COUNT(*)` of assets in the scope. */
  assetCount: number;
}

/** One `instance_storage_budgets` row, as the enforcement path reads it. */
export interface StorageBudget {
  scope: StorageBudgetScope;
  softLimitBytes: number | null;
  hardLimitBytes: number | null;
  evictionPolicy: StorageEvictionPolicy;
}

/** Asset classes a non-total budget scopes to, mirroring `assets.asset_type`. */
const CLASS_TO_ASSET_TYPE: Record<Exclude<StorageBudgetScope, "total">, AssetType> = {
  image: AssetType.Image,
  audio: AssetType.Audio,
  video: AssetType.Video,
  other: AssetType.Other,
};

/**
 * Read byte usage for a scope. Never walks the disk.
 * @param opts
 * @param opts.database Receiver database handle.
 * @param opts.scope Budget scope; `total` covers every asset class.
 * @returns {Promise<StorageUsage>}
 */
export async function readStorageUsage({
  database,
  scope,
}: {
  database: Kysely<DB>;
  scope: StorageBudgetScope;
},): Promise<StorageUsage> {
  const assets = database
    .selectFrom("assets",)
    .select((eb,) => [
      sql<number>`coalesce(sum(${eb.ref("size_bytes",)}), 0)`.as("asset_bytes",),
      sql<number>`count(*)`.as("asset_count",),
    ]);

  const scoped = scope === "total" ? assets : assets.where("asset_type", "=", CLASS_TO_ASSET_TYPE[scope],);
  const assetRow = await scoped.executeTakeFirst();
  const assetBytes = Number(assetRow?.asset_bytes ?? 0,);
  const assetCount = Number(assetRow?.asset_count ?? 0,);

  const heldRow = await database
    .selectFrom("mesh_reservations",)
    .select((eb,) => sql<number>`coalesce(sum(${eb.ref("size_bytes",)}), 0)`.as("held",))
    .where("state", "in", [...OPEN_RESERVATION_STATES,],)
    .executeTakeFirst();

  const heldBytes = Number(heldRow?.held ?? 0,);

  return { assetBytes, heldBytes, totalBytes: assetBytes + heldBytes, assetCount, };
}

/**
 * Read the configured budget for a scope, or null when the operator set none.
 * Null is the federation-off default: every caller treats it as unlimited.
 * @param opts
 * @param opts.database
 * @param opts.scope
 * @returns {Promise<StorageBudget | null>}
 */
export async function readStorageBudget({
  database,
  scope,
}: {
  database: Kysely<DB>;
  scope: StorageBudgetScope;
},): Promise<StorageBudget | null> {
  const row = await database
    .selectFrom("instance_storage_budgets",)
    .select(["asset_class", "soft_limit_bytes", "hard_limit_bytes", "eviction_policy",],)
    .where("asset_class", "=", scope,)
    .executeTakeFirst();

  if (!row) { return null; }

  return {
    scope: row.asset_class,
    softLimitBytes: row.soft_limit_bytes,
    hardLimitBytes: row.hard_limit_bytes,
    evictionPolicy: row.eviction_policy,
  };
}
