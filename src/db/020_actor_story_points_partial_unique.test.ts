// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Final-schema behavior for the actor_story_points uniqueness key.
 *
 * The retired 020 migration added two partial unique indexes so NULL-world
 * rows are unique too. In the 14-file baseline those indexes ship inline; the
 * tests below assert the final shape is enforced, including the NULL half a
 * plain UNIQUE(actor_id, world_id) index would leave open.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";

import { createSqliteDialect, } from "./index";
import { getMigrationFiles, } from "./migrate";
import type { DB, } from "./schema";

/** Apply the 14-file baseline to this test's isolated in-memory DB. */
async function applyBaseline(database: Kysely<unknown>,): Promise<void> {
  for (const migration of Object.values(await getMigrationFiles(),)) {
    await migration.up(database,);
  }
}

describe("actor_story_points partial unique (final schema)", () => {
  let raw: Database;
  let db: Kysely<DB>;

  beforeEach(async () => {
    raw = new Database(":memory:",);
    db = new Kysely<DB>({ dialect: createSqliteDialect(raw,), },);
    await applyBaseline(db as unknown as Kysely<unknown>,);
  },);

  afterEach(async () => {
    await db.destroy();
    raw.close();
  },);

  async function insert(id: string, actorId: string, worldId: string | null,): Promise<void> {
    await db.insertInto("actor_story_points",).values({
      id,
      actor_id: actorId,
      world_id: worldId,
    },).execute();
  }

  test("both partial unique indexes are present", () => {
    const rows = raw
      .query("SELECT name, partial FROM pragma_index_list('actor_story_points')",)
      .all() as { name: string; partial: number }[];

    const global = rows.find((r,) => r.name === "uq_actor_story_points_actor_global");
    const world = rows.find((r,) => r.name === "uq_actor_story_points_actor_world_set");
    expect(global, "NULL-world partial index",).toBeDefined();
    expect(global!.partial,).toBe(1,);
    expect(world, "world-bound partial index",).toBeDefined();
    expect(world!.partial,).toBe(1,);
  });

  test("NULL-world duplicates are rejected — the 020 regression", async () => {
    await insert("row-a", "actor-dup", null,);
    await expect(insert("row-b", "actor-dup", null,),).rejects.toThrow(/UNIQUE/i,);
    expect(
      await db.selectFrom("actor_story_points",).select("id",).where("actor_id", "=", "actor-dup",).execute(),
    ).toEqual([{ id: "row-a", },],);
  });

  test("world-bound duplicates are rejected", async () => {
    await insert("row-a", "actor-dup", "world-1",);
    await expect(insert("row-b", "actor-dup", "world-1",),).rejects.toThrow(/UNIQUE/i,);
  });

  test("same actor with distinct worlds stays allowed", async () => {
    await insert("row-a", "actor-dup", null,);
    await insert("row-b", "actor-dup", "world-1",);
    await insert("row-c", "actor-dup", "world-2",);
    expect(await db.selectFrom("actor_story_points",).select("id",).execute(),).toHaveLength(3,);
  });
});
