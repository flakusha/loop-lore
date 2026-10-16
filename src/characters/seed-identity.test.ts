// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/seed-identity.test.ts — Regression tests for seeded-character
// identity: boot seeding must key on the stable template id, never on the
// mutable `actors.display_name` that the character edit route lets users change
// (BUG-character-seed-dedupes-on-display-name).

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { CharactersConfig, } from "../config/schema";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { seedCharacterTemplates, } from "./seed";

describe("seedCharacterTemplates identity", () => {
  let fixture: TestDb;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    fixture = await createTestDb();
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  /** Simulate an in-app rename: the edit route lets display_name change freely. */
  async function rename(id: string, displayName: string,): Promise<void> {
    const { db, } = fixture;
    await db.updateTable("actors",).set({ display_name: displayName, },).where("id", "=", id,).execute();
  }

  async function countByName(prefix: string,): Promise<number> {
    const rows = await fixture.db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "like", `${prefix}%`,)
      .execute();

    return rows.length;
  }

  async function countById(id: string,): Promise<number> {
    const rows = await fixture.db.selectFrom("actors",).select("id",).where("id", "=", id,).execute();

    return rows.length;
  }

  test("re-seed after an in-app rename is a no-op (template with an explicit id)", async () => {
    const { db, } = fixture;
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        { id: "tpl-rename-explicit", name: "Rename Explicit", description: "Template carrying an id", },
      ],
    };

    const seeded = await seedCharacterTemplates(db, config,);
    expect(seeded,).toEqual({ created: 1, skipped: 0, errors: [], },);

    await rename("tpl-rename-explicit", "Renamed By Operator",);

    const reseeded = await seedCharacterTemplates(db, config,);
    expect(reseeded.errors,).toEqual([],);
    expect(reseeded.created,).toBe(0,);
    expect(reseeded.skipped,).toBe(1,);
    // The rename changed display_name to "Renamed By Operator" — still exactly
    // one row with the template's stable id, no second row seeded.
    expect(await countById("tpl-rename-explicit",),).toBe(1,);
    expect(await countByName("Renamed By Operator",),).toBe(1,);
  });

  test("re-seed after an in-app rename is a no-op (template without an id)", async () => {
    const { db, } = fixture;
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        { name: "Rename Idless", description: "Template without an id", },
      ],
    };

    const seeded = await seedCharacterTemplates(db, config,);
    expect(seeded,).toEqual({ created: 1, skipped: 0, errors: [], },);

    const [seededRow,] = await db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", "Rename Idless",)
      .execute();

    const seededId = seededRow!.id;

    await rename(seededId, "Renamed Idless Character",);

    const reseeded = await seedCharacterTemplates(db, config,);
    expect(reseeded.errors,).toEqual([],);
    expect(reseeded.created,).toBe(0,);
    expect(reseeded.skipped,).toBe(1,);
    expect(seededId,).toBe("tpl-rename-idless",);
    expect(await countByName("Rename Idless",),).toBe(0,);
    expect(await countByName("Renamed Idless Character",),).toBe(1,);
  });

  test("a deleted row is recreated on the next seed", async () => {
    const { db, } = fixture;
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        { id: "tpl-delete-recreate", name: "Delete Then Recreate", description: "Recreated after delete", },
      ],
    };

    const seeded = await seedCharacterTemplates(db, config,);
    expect(seeded.created,).toBe(1,);

    await db.deleteFrom("actors",).where("id", "=", "tpl-delete-recreate",).execute();

    const reseeded = await seedCharacterTemplates(db, config,);
    expect(reseeded,).toEqual({ created: 1, skipped: 0, errors: [], },);
    expect(await countById("tpl-delete-recreate",),).toBe(1,);
  });

  test("a deleted id-less row is recreated on the next seed", async () => {
    const { db, } = fixture;
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        { name: "Delete Idless", description: "Id-less, recreated after delete", },
      ],
    };

    const seeded = await seedCharacterTemplates(db, config,);
    expect(seeded.created,).toBe(1,);

    const [seededRow,] = await db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", "Delete Idless",)
      .execute();

    const seededId = seededRow!.id;

    await db.deleteFrom("actors",).where("display_name", "=", "Delete Idless",).execute();

    const reseeded = await seedCharacterTemplates(db, config,);
    expect(reseeded,).toEqual({ created: 1, skipped: 0, errors: [], },);
    expect(seededId,).toBe("tpl-delete-idless",);
    expect(await countById(seededId,),).toBe(1,);
  });
});
