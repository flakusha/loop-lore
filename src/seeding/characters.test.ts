// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/seeding/characters.test.ts — Identity regression for config character
// seeding: the stable row id must survive an in-app display_name rename.

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { stableSeedCharacterId, } from "../characters/seed/identity";
import type { SeedCharacter, } from "../config/schema";
import { ActorType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, getLogger, } from "../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { seedCharacters, } from "./characters";

const OWNER = "seed-owner-1";
const OWNER_USERNAME = "seedowner";

describe("seedCharacters identity", () => {
  let fixture: TestDb;
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    fixture = await createTestDb();
    db = fixture.db;
    await db
      .insertInto("users",)
      .values({ id: OWNER, username: OWNER_USERNAME, display_name: "Seed Owner", password_hash: null, },)
      .execute();
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  /** Username → owner id, the map `seedConfiguredContent` builds for this step. */
  function userById(): ReadonlyMap<string, string> {
    return new Map([[OWNER_USERNAME, OWNER,],],);
  }

  async function countByName(name: string,): Promise<number> {
    const rows = await db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", name,)
      .where("actor_type", "=", ActorType.Character,)
      .execute();

    return rows.length;
  }

  test("re-seed after an in-app rename does not duplicate the row", async () => {
    const characters: readonly SeedCharacter[] = [
      { name: "Seeded Rename Victim", owner: OWNER_USERNAME, description: "Will be renamed", },
    ];

    const log = getLogger().child({},);
    const first = await seedCharacters(db, characters, userById(), log,);
    expect(first,).toBe(1,);
    expect(await countByName("Seeded Rename Victim",),).toBe(1,);

    // The character edit route lets the user change display_name freely.
    await db
      .updateTable("actors",)
      .set({ display_name: "Seeded Renamed", },)
      .where("id", "=", stableSeedCharacterId(OWNER_USERNAME, "Seeded Rename Victim",),)
      .execute();

    const second = await seedCharacters(db, characters, userById(), log,);
    expect(second,).toBe(0,);
    expect(await countByName("Seeded Rename Victim",),).toBe(0,);
    expect(await countByName("Seeded Renamed",),).toBe(1,);
  });

  test("a deleted row is recreated on the next seed", async () => {
    const characters: readonly SeedCharacter[] = [
      { name: "Seeded Delete Victim", owner: OWNER_USERNAME, description: "Deleted then recreated", },
    ];

    const log = getLogger().child({},);

    expect(await seedCharacters(db, characters, userById(), log,),).toBe(1,);
    await db
      .deleteFrom("actors",)
      .where("id", "=", stableSeedCharacterId(OWNER_USERNAME, "Seeded Delete Victim",),)
      .execute();

    expect(await seedCharacters(db, characters, userById(), log,),).toBe(1,);
    expect(await countByName("Seeded Delete Victim",),).toBe(1,);
  });
});
