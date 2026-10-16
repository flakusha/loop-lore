// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/seeding/characters.test.ts — Identity regression for config character
// seeding: the stable row id must survive an in-app display_name rename.

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { stableSeedCharacterId, } from "../characters/seed/identity";
import type { SeedCharacter, } from "../config/schema";
import { ActorType, AgentType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, getLogger, } from "../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
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
      .values({ id: OWNER, username: OWNER_USERNAME, display_name: "Seed Owner", secret_hash: null, },)
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

  async function countById(id: string,): Promise<number> {
    const rows = await db.selectFrom("actors",).select("id",).where("id", "=", id,).execute();
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

  test("an existing deployment's rows are adopted, never duplicated", async () => {
    // This path allocated `uid()` unconditionally, so every pre-upgrade row has
    // a crypto-random id that the deterministic key cannot resolve.
    const characters: readonly SeedCharacter[] = [
      { name: "Legacy Config Character", owner: OWNER_USERNAME, description: "Pre-upgrade row", },
    ];

    const legacyId = uid();
    await db
      .insertInto("actors",)
      .values({
        id: legacyId,
        actor_type: ActorType.Character,
        agent_type: AgentType.None,
        display_name: "Legacy Config Character",
        description: "Pre-upgrade row",
        visibility: "private",
        user_id: null,
        owner_id: OWNER,
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
        row_version: 0,
      },)
      .execute();

    const log = getLogger().child({},);

    // First boot after upgrade: adopt the row instead of seeding alongside it.
    expect(await seedCharacters(db, characters, userById(), log,),).toBe(0,);
    expect(await countById(legacyId,),).toBe(1,);

    // Adoption converges the row onto the stable identity, so a later rename
    // is still a no-op and the original row keeps its id.
    await db
      .updateTable("actors",)
      .set({ display_name: "Renamed Legacy Config Character", },)
      .where("id", "=", legacyId,)
      .execute();

    expect(await seedCharacters(db, characters, userById(), log,),).toBe(0,);
    expect(await countById(legacyId,),).toBe(1,);

    // Deleting it still lets the next seed recreate it, now with the stable id.
    await db.deleteFrom("actors",).where("id", "=", legacyId,).execute();
    expect(await seedCharacters(db, characters, userById(), log,),).toBe(1,);
    expect(await countByName("Legacy Config Character",),).toBe(1,);
  });

  test("distinct names sharing a slug still seed distinct rows", async () => {
    const characters: readonly SeedCharacter[] = [
      { name: "Dr. Thorne", owner: OWNER_USERNAME, description: "built-in spelling", },
      { name: "Dr.Thorne", owner: OWNER_USERNAME, description: "same slug, different string", },
    ];

    const log = getLogger().child({},);
    expect(await seedCharacters(db, characters, userById(), log,),).toBe(2,);
    expect(await countByName("Dr. Thorne",),).toBe(1,);
    expect(await countByName("Dr.Thorne",),).toBe(1,);
  });
});
