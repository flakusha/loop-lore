// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-schema oracle for the `(actor_id, world_id, currency_type)` unique
 * index on `actor_currencies` (owned by 003_actors in the consolidated chain).
 *
 * ensureBalanceRow was SELECT-then-INSERT with no constraint covering
 * currency_type, so two concurrent ensures both inserted a ledger row. The
 * final schema makes the DATABASE the arbiter; the migration-time collapse of
 * pre-existing duplicates is gone, so this file pins the constraint and scope.
 */
import { describe, expect, test, } from "bun:test";
import { type Kysely, sql, } from "kysely";

import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActorCurrencies,
  insertActors,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import type { DB, } from "./schema";

const UNIQUE_INDEX = "uq_actor_currencies_actor_world_currency";

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

describe("actor_currencies unique (final schema)", () => {
  test("the unique index is present and rejects a racing duplicate ledger row", async () => {
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

      expect(await hasIndex(db, UNIQUE_INDEX,),).toBe(true,);
      await insertActorCurrencies(db, actorId, worldId, "gold", { balance: 10, },);

      // The racing second ensure now aborts at the database.
      await expect(
        insertActorCurrencies(db, actorId, worldId, "gold", { balance: 20, },),
      ).rejects.toThrow(/UNIQUE/i,);

      const rows = await db
        .selectFrom("actor_currencies",)
        .selectAll()
        .where("actor_id", "=", actorId,)
        .where("world_id", "=", worldId,)
        .where("currency_type", "=", "gold",)
        .execute();

      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.balance,).toBe(10,);
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

      await insertActorCurrencies(db, actorId, worldId, "gold", { balance: 10, },);
      await insertActorCurrencies(db, actorId, worldId, "silver", { balance: 5, },);

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
});
