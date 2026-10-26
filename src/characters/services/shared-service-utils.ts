// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Shared helpers for character services (mood, relationships, traits).
// Eliminates duplicate worldId query filtering and existence-check patterns.

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/**
 * Run `fn` inside a transaction, reusing the ambient one when the handle is
 * already a Transaction.
 *
 * Two failure modes this avoids:
 * - `db.transaction()` on a Transaction throws ("calling the transaction
 *   method for a Transaction is not supported") — so a service called from
 *   inside a caller's transaction must NOT open a second one.
 * - Running a query through the OUTER handle while a transaction is open
 *   deadlocks: the SQLite driver is single-connection, so the outer query
 *   waits for a connection the transaction already holds. Always query
 *   through the handle passed to `fn`.
 * @param db - The caller's handle (plain Kysely or an open Transaction)
 * @param fn - Receives the handle to query with
 * @returns The value returned by `fn`
 */
export async function withTransaction<T,>(
  db: Kysely<DB>,
  fn: (trx: Kysely<DB>,) => Promise<T>,
): Promise<T> {
  if (db.isTransaction) {
    return fn(db,);
  }

  return db.transaction().execute(fn,);
}

/**
 * The slice of a Kysely builder the world-scope helpers need. Method syntax
 * keeps the parameter bivariant, so a concrete `SelectQueryBuilder` (whose
 * `where` narrows the column name) still satisfies it without a cast to `any`.
 */
export interface WorldFilterable<T,> {
  where(column: string, op: "=", value: string,): T;
  where(column: string, op: "is", value: null,): T;
}

/**
 * Apply an EXPLICIT world scope to a Kysely query builder: filter to the
 * given world when one is supplied, otherwise restrict to the global
 * (world_id IS NULL) scope — never an unscoped, world-agnostic match.
 *
 * Use this for per-entity reads and mutations (relationships, traits) where
 * an omitted worldId must not silently span every world's rows: an update or
 * delete without a scope could otherwise hit an arbitrary world's row when
 * the same actor pair exists in several worlds.
 * @param qb
 * @param worldId
 * @param worldCol
 * @returns the query builder narrowed to the world, or to the global scope
 */
export function withExplicitWorldScope<T extends WorldFilterable<T>,>(
  qb: T,
  worldId: string | undefined,
  worldCol = "world_id",
): T {
  if (worldId !== undefined) {
    return qb.where(worldCol, "=", worldId,);
  }

  return qb.where(worldCol, "is", null,);
}

/**
 * Apply worldId conditional filter to a Kysely query builder (world-agnostic
 * when omitted). Handles the null-world (global) vs specific-world distinction.
 *
 * WORLD-AGNOSTIC contract: an undefined worldId adds NO world filter, so the
 * query spans the global (NULL) scope and every world-scoped row. Only use
 * for genuinely scope-spanning lookups (e.g. mood resolution, where the
 * effective state is read across scopes); per-entity read/update/delete
 * paths must use {@link withExplicitWorldScope} instead — a world-agnostic
 * write can hit an arbitrary world's row.
 *
 * Usage:
 *   const qb = db.selectFrom("table").where("actor_id", "=", actorId);
 *   const filtered = withWorldId(qb, worldId);
 *   const result = await filtered.selectAll().executeTakeFirst();
 * @param qb
 * @param worldId
 * @param worldCol
 * @returns the same query builder, narrowed to the world when one was given
 */
export function withWorldId<T extends WorldFilterable<T>,>(
  qb: T,
  worldId: string | undefined,
  worldCol = "world_id",
): T {
  // An undefined worldId means the caller is world-agnostic: add NO world
  // filter so the query spans the global (NULL) scope and every world-scoped
  // row. Forcing `world_id is null` here used to hide world-scoped rows from
  // global lookups (and let a write pair read one row set and write another).
  if (!worldId) { return qb; }

  return qb.where(worldCol, "=", worldId,);
}

/**
 * Throw if an entity already exists. Call before INSERT to guard duplicates.
 * @param existing - Truthy value means the entity already exists
 * @param entityLabel - Human-readable entity name (e.g., "Mood", "Permanent trait")
 * @param key - Identifying context for the error message
 * @returns void
 * @throws {Error}
 */
export function guardNotExists(
  existing: unknown,
  entityLabel: string,
  key: string,
): void {
  if (existing) {
    throw new Error(`${entityLabel} already exists for ${key}`,);
  }
}
