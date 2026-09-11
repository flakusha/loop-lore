// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for recipe base-property updates. */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, resetTestDb, } from "../../../test-utils/create-test-db";
import {
  insertCraftingRecipes,
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { updateRecipe, } from "./update";

createLogger({ level: "error", },);

let db: Kysely<DB>;
let sqlite: Database;

beforeAll(async () => {
  const testDb = await createTestDb();
  db = testDb.db;
  sqlite = testDb.sqlite;
},);

afterAll(async () => {
  await db.destroy();
},);

beforeEach(async () => {
  resetTestDb(sqlite,);
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "World", { id: "world-1", },);
  await insertItems(db, "world-1", "Iron Ingot", "material", { id: "item-1", },);
  await insertCraftingRecipes(db, "world-1", "Iron Sword", "smithing", "item-1", "2026-01-01", "2026-01-01", {
    id: "recipe-1",
  },);
},);

async function row() {
  return db.selectFrom("crafting_recipes",).selectAll().where("id", "=", "recipe-1",).executeTakeFirst();
}

describe("updateRecipe", () => {
  test("updates the given fields and refreshes updated_at", async () => {
    expect(await updateRecipe(db, "recipe-1", { name: "Steel Sword", tier: 2, },),).toBe(true,);
    const after = await row();
    expect(after?.name,).toBe("Steel Sword",);
    expect(after?.tier,).toBe(2,);
    expect(after?.discipline,).toBe("smithing",);
    expect((after?.updated_at ?? "") >= "2026-01-01",).toBe(true,);
  });

  test("unknown id returns false", async () => {
    expect(await updateRecipe(db, "recipe-missing", { name: "Ghost", },),).toBe(false,);
  });

  test("maps discoveredByDefault and tags to storage form", async () => {
    expect(
      await updateRecipe(db, "recipe-1", { discoveredByDefault: true, tags: ["sharp", "metal",], },),
    ).toBe(true,);
    const after = await row();
    expect(after?.discovered_by_default,).toBe(1,);
    expect(JSON.parse((after?.tags ?? "[]") as string,),).toEqual(["sharp", "metal",],);
  });
});
