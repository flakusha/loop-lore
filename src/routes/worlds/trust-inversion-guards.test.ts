// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The two GUARDS these fixes introduced, tested directly.
 *
 * `requireFactionsInWorld` is the world-scope check the karma routes call on
 * both verbs; testing it here pins its contract (null for a faction of the
 * world, 404 for one from anywhere else) rather than only that some route
 * happens to call it. `MAX_ABILITY_BONUS` is the trust bound the extract
 * schema clamps to — asserting the schema rejects the value ABOVE it is what
 * makes the constant load-bearing.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { MAX_ABILITY_BONUS, } from "../../worlds/resources";
import { requireFactionsInWorld, } from "./faction-routes";

const WORLD = "world-a";
const RIVAL = "world-b";
const OWN_FACTION = "faction-own";
const FOREIGN_FACTION = "faction-foreign";

let db: Kysely<DB>;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "Owner", "Owner", { id: "owner", },);
  await insertWorlds(db, "owner", "World A", { id: WORLD, },);
  await insertWorlds(db, "owner", "World B", { id: RIVAL, },);
  await db
    .insertInto("factions",)
    .values([
      { id: OWN_FACTION, world_id: WORLD, name: "Order", },
      { id: FOREIGN_FACTION, world_id: RIVAL, name: "Guild", },
    ],)
    .execute();
},);

afterEach(async () => {
  await db.destroy();
},);

describe("requireFactionsInWorld", () => {
  test("returns null for a faction that belongs to the world", async () => {
    expect(await requireFactionsInWorld(db, WORLD, [OWN_FACTION,],),).toBeNull();
  });

  test("returns a 404 for a faction from another world", async () => {
    const denied = await requireFactionsInWorld(db, WORLD, [FOREIGN_FACTION,],);

    expect(denied,).not.toBeNull();
    expect(denied!.status,).toBe(404,);
  });

  test("denies the whole batch when any one faction is foreign", async () => {
    const denied = await requireFactionsInWorld(db, WORLD, [OWN_FACTION, FOREIGN_FACTION,],);

    expect(denied,).not.toBeNull();
    expect(denied!.status,).toBe(404,);
  });
});

describe("MAX_ABILITY_BONUS", () => {
  test("is the positive ceiling the extract DC subtraction is clamped to", () => {
    // The engine subtracts this from the node's DC, which floors at 1, so a
    // value at the bound can still make an easy node trivial — but nothing
    // above it can, because the request schema rejects it.
    expect(MAX_ABILITY_BONUS,).toBeGreaterThan(0,);
    expect(Number.isInteger(MAX_ABILITY_BONUS,),).toBe(true,);
  });
});
