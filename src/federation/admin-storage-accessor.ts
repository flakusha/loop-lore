// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/federation/admin-storage-accessor.ts — storage-budget read seam for the
 * admin usage dashboard.
 *
 * DEPENDENCY: the authoritative storage-quota modules live on the unmerged
 * `feat-fed-storage-quota` branch (`src/federation/storage-usage.ts`, migration
 * `066_instance_storage_budgets.ts`). That branch is deliberately NOT merged
 * here — it is not one of this epic's three integration bases — so this module
 * reads the same `assets` / `mesh_reservations` figures directly rather than
 * importing across a branch that does not exist on this line.
 *
 * The byte arithmetic is the DB-authoritative one the epic specifies
 * (`SUM(assets.size_bytes)` plus open reservation holds; disk is reconciled
 * against, never sourced from). When `feat-fed-storage-quota` finalizes, this
 * file collapses to a re-export of its `readStorageUsage` / `readStorageBudget`
 * and the route callers do not change.
 *
 * `budgetsAvailable` is false until `instance_storage_budgets` exists in the
 * applied migration chain, so the panel renders the usage figure without
 * pretending a budget the operator has not configured.
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../db/schema";
import { OPEN_RESERVATION_STATES, } from "./sharing";

/** Byte totals for the instance as a whole. */
export interface AdminStorageUsage {
  /** `SUM(assets.size_bytes)` across every asset. */
  assetBytes: number;
  /** `SUM(mesh_reservations.size_bytes)` over OPEN reservations only. */
  heldBytes: number;
  /** `assetBytes + heldBytes` — the figure a limit is compared against. */
  totalBytes: number;
  /** `COUNT(*)` of assets. */
  assetCount: number;
  /** False until `feat-fed-storage-quota` lands the budgets table. */
  budgetsAvailable: boolean;
}

/**
 * True once `instance_storage_budgets` is in the applied chain. Probed per
 * read rather than cached: the table arrives with a migration, and a cached
 * `false` would outlive the migration that makes it true.
 * @param database
 * @returns {Promise<boolean>}
 */
export async function storageBudgetsAvailable(database: Kysely<DB>,): Promise<boolean> {
  const row = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'instance_storage_budgets'
  `.execute(database,);

  return row.rows.length > 0;
}

/**
 * DB-authoritative byte accounting for the admin dashboard. Two aggregate
 * queries, no filesystem walk — `du` is a reconciliation target, not a ledger.
 * @param options
 * @param options.database
 * @returns {Promise<AdminStorageUsage>}
 */
export async function readAdminStorageUsage(
  options: { database: Kysely<DB> },
): Promise<AdminStorageUsage> {
  const assetRow = await options.database
    .selectFrom("assets",)
    .select((eb,) => [
      sql<number>`coalesce(sum(${eb.ref("size_bytes",)}), 0)`.as("asset_bytes",),
      sql<number>`count(*)`.as("asset_count",),
    ])
    .executeTakeFirst();

  const heldRow = await options.database
    .selectFrom("mesh_reservations",)
    .select((eb,) => sql<number>`coalesce(sum(${eb.ref("size_bytes",)}), 0)`.as("held",))
    .where("state", "in", [...OPEN_RESERVATION_STATES,],)
    .executeTakeFirst();

  const assetBytes = Number(assetRow?.asset_bytes ?? 0,);
  const heldBytes = Number(heldRow?.held ?? 0,);

  return {
    assetBytes,
    heldBytes,
    totalBytes: assetBytes + heldBytes,
    assetCount: Number(assetRow?.asset_count ?? 0,),
    budgetsAvailable: await storageBudgetsAvailable(options.database,),
  };
}
