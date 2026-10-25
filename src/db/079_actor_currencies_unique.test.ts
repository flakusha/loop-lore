// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 079 — UNIQUE index on
 * `actor_currencies (actor_id, world_id, currency_type)`.
 *
 * `ensureBalanceRow` (src/services/trade/balance.ts) was SELECT-then-INSERT
 * with no constraint covering currency_type, so two concurrent ensures for
 * one (actor, world, currency) both inserted a ledger row
 * (BUG-service-layer-multi-query-mutations, ensureBalanceRow leg). 079 makes
 * the DATABASE the arbiter — and first collapses the duplicate groups a raced
 * database already accumulated, because `CREATE UNIQUE INDEX` aborts on those
 * and would leave the migration chain stuck half-applied.
 *
 * Mirrors src/db/078_user_api_keys_unique.test.ts and, like it, lives in
 * `src/db/` NOT `src/db/migrations/` (getMigrationFiles would register the
 * colocated test as a migration).
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { captureWarnings, } from "../test-utils/capture-warnings";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActorCurrencies,
  insertActors,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { down, up, } from "./migrations/079_actor_currencies_unique";
import type { DB, } from "./schema";

const MIGRATION = "079_actor_currencies_unique";
const UNIQUE_INDEX = "uq_actor_currencies_actor_world_currency";

/** `up`/`down` are typed against the untyped handle the migrator passes them. */
type UntypedDb = Kysely<unknown>;

/**
 * @param db database handle
 * @param name index to look for
 * @returns whether that index is present in the schema
 */
async function hasIndex(db: Kysely<DB>, name: string,): Promise<boolean> {
  const rows = await sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${name}
  `.execute(db,);

  return rows.rows.length > 0;
}

describe(MIGRATION, () => {
  test("collapses a duplicate ledger group to its newest row, warns, then enforces the index", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `cur-${crypto.randomUUID()}`, "Cur",);
      const worldId = crypto.randomUUID();
      await insertWorlds(db, userId, "Ledger World", { id: worldId, },);
      const actorId = crypto.randomUUID();
      await insertActors(db, "Trader", {
        id: actorId,
        actor_type: "character" as never,
        user_id: userId,
        owner_id: userId,
        agent_type: "ai" as never,
        settings: "{}",
      },);

      // The index exists already (079 ran in the chain) — drop it so the
      // duplicate rows can be inserted again.
      await down(db as unknown as UntypedDb,);
      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(false,);

      await Promise.all([
        insertActorCurrencies(db, actorId, worldId, "gold", { balance: 10, },),
        insertActorCurrencies(db, actorId, worldId, "gold", { balance: 20, },),
      ],);

      const warnings = await captureWarnings(async () => {
        await up(db as unknown as UntypedDb,);
      }, new RegExp(`^\\[${MIGRATION}\\]`,),);

      expect(warnings,).toHaveLength(1,);
      expect(warnings[0],).toContain(MIGRATION,);
      expect(warnings[0],).toContain("collapsing to newest",);

      const rows = await db
        .selectFrom("actor_currencies",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .where("world_id", "=", worldId,)
        .where("currency_type", "=", "gold",)
        .execute();

      expect(rows,).toHaveLength(1,);
      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(true,);

      // Enforced: the racing second ensure now aborts at the database.
      await expect(
        insertActorCurrencies(db, actorId, worldId, "gold", { balance: 30, },),
      ).rejects.toThrow(/UNIQUE/i,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });

  test("a different currency for the same actor is not a duplicate group", async () => {
    const { db, sqlite, } = await createTestDb();
    try {
      const userId = await insertUsers(db, `cur-${crypto.randomUUID()}`, "Cur",);
      const worldId = crypto.randomUUID();
      await insertWorlds(db, userId, "Ledger World", { id: worldId, },);
      const actorId = crypto.randomUUID();
      await insertActors(db, "Trader", {
        id: actorId,
        actor_type: "character" as never,
        user_id: userId,
        owner_id: userId,
        agent_type: "ai" as never,
        settings: "{}",
      },);

      await down(db as unknown as UntypedDb,);
      await Promise.all([
        insertActorCurrencies(db, actorId, worldId, "gold", { balance: 10, },),
        insertActorCurrencies(db, actorId, worldId, "silver", { balance: 5, },),
      ],);

      const warnings = await captureWarnings(async () => {
        await up(db as unknown as UntypedDb,);
      }, new RegExp(`^\\[${MIGRATION}\\]`,),);

      expect(warnings,).toEqual([],);
      const rows = await db
        .selectFrom("actor_currencies",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .where("world_id", "=", worldId,)
        .execute();

      expect(rows,).toHaveLength(2,);
    } finally {
      await db.destroy();
      sqlite.close();
    }
  });
},);
