// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared world-scoping helpers.
 *
 * Every `world_id`-scoped table in the game domain (crafting, gathering,
 * recipes, …) needs the same WHERE clause pre-applied to every SELECT,
 * UPDATE, and DELETE. Inlining `db.selectFrom(table).where("world_id",
 * "=", worldId)` at every call site is noisy and easy to get wrong.
 *
 * This module lifts that pattern into two reusable pieces:
 *
 * - `worldScoped` — return a Kysely query builder already filtered to
 *   `WHERE world_id = ?`. The caller can chain `.selectAll()`,
 *   `.where(...)`, `.orderBy(...)`, and friends as usual.
 * - `validateWorldAccess` — fast boolean membership check for use in
 *   middleware / authorization. Returns true when the user has a row
 *   in `world_members` for the given world.
 *
 * The helpers are intentionally minimal — they only project behaviour
 * already inlined at call sites, so swapping them in is a no-op apart
 * from reducing duplication.
 */

import type { Kysely, SelectQueryBuilder, } from "kysely";
import type { DB, } from "./schema";

/**
 * Tables with a `world_id` column that participate in world-scoped
 * queries. Restricting the helper to this union forces callers to pass a
 * real scoped table name, so we cannot accidentally filter
 * `world_members` itself with a redundant predicate.
 */
export type WorldScopedTable = {
  [K in keyof DB]: "world_id" extends keyof DB[K] ? K : never;
}[keyof DB];

/**
 * Build a Kysely `SelectQueryBuilder` pre-filtered to `world_id = ?`.
 *
 *     const q = worldScoped(db, "crafting_station_instances", worldId);
 *     const rows = await q.selectAll().execute();
 *
 * Accepts any Kysely-compatible `DB` handle, including the test-only
 * `Kysely<DB>` and the production handle exposed by `getDatabase()`.
 *
 * @param db      Kysely database handle.
 * @param table   Table name (must be in `WorldScopedTable`).
 * @param worldId World id to scope the query to.
 * @returns A query builder ready for the caller to chain against.
 */
export function worldScoped<T extends WorldScopedTable>(
  db: Kysely<DB>,
  table: T,
  worldId: string,
): SelectQueryBuilder<DB, T, {}> {
  // Kysely's `selectFrom` over a union of `WorldScopedTable` types
  // produces a builder whose `.where()` signature is incompatible across
  // union members (each member has a different `world_id` column type).
  // The structural invariant is guaranteed by `WorldScopedTable` (every
  // table in the union has `world_id`), so we narrow with a cast.
  const base = db.selectFrom(table) as SelectQueryBuilder<DB, T, {}>;
  return base.where("world_id" as never, "=", worldId as never) as SelectQueryBuilder<DB, T, {}>;
}

/**
 * Check whether a user is a member of the given world.
 *
 * Returns true when there is at least one row in `world_members` with
 * matching `world_id` and `actor_id`. The existing call sites in
 * `routes/worlds/worlds.ts` and `routes/worlds/access.ts` use
 * `actor_id = userId` as the membership predicate, so we follow the same
 * shape here.
 *
 * @param db      Kysely database handle.
 * @param userId  User id (used as the `actor_id` predicate).
 * @param worldId World id to test membership for.
 * @returns Promise resolving to true when membership exists.
 */
export async function validateWorldAccess(
  db: Kysely<DB>,
  userId: string,
  worldId: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("world_members")
    .select("actor_id")
    .where("world_id", "=", worldId)
    .where("actor_id", "=", userId)
    .executeTakeFirst();
  return row !== undefined;
}
