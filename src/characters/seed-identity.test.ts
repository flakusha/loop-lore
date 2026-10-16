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
import { uid, } from "../utils";
import { seedCharacterTemplates, } from "./seed";
import { adoptExistingActor, findExistingActor, slugifyName, stableTemplateId, } from "./seed/identity";

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
    expect(seededId,).toBe(stableTemplateId({ name: "Rename Idless", },),);
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
    expect(seededId,).toBe(stableTemplateId({ name: "Delete Idless", },),);
    expect(await countById(seededId,),).toBe(1,);
  });

  test("an existing deployment's rows are adopted, never duplicated", async () => {
    const { db, } = fixture;
    const config: CharactersConfig = {
      enabled: true,
      templates: [{ name: "Legacy Seeded Character", description: "Pre-upgrade row", },],
    };

    // A row allocated the way the pre-change code did: `template.id ?? uid()`.
    const legacyId = uid();
    await db
      .insertInto("actors",)
      .values({
        id: legacyId,
        actor_type: "character",
        display_name: "Legacy Seeded Character",
        user_id: null,
        owner_id: null,
        agent_type: "ai",
        description: "Pre-upgrade row",
        visibility: "public",
        settings: JSON.stringify({ is_template: false, is_default: false, },),
        import_spec: "template",
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
      },)
      .execute();

    // First boot after upgrade: the deterministic id resolves nothing yet, so
    // the pre-existing row must be adopted rather than re-seeded alongside.
    const first = await seedCharacterTemplates(db, config,);
    expect(first,).toEqual({ created: 0, skipped: 1, errors: [], },);
    expect(await countById(legacyId,),).toBe(1,);

    // Adoption converges the row onto the stable identity, so a later rename
    // is still a no-op and the original row keeps its id.
    await rename(legacyId, "Renamed Legacy Character",);
    const second = await seedCharacterTemplates(db, config,);
    expect(second,).toEqual({ created: 0, skipped: 1, errors: [], },);
    expect(await countById(legacyId,),).toBe(1,);

    // Deleting it still lets the next seed recreate it, now with the stable id.
    await db.deleteFrom("actors",).where("id", "=", legacyId,).execute();
    const third = await seedCharacterTemplates(db, config,);
    expect(third,).toEqual({ created: 1, skipped: 0, errors: [], },);
    expect(await countById(stableTemplateId({ name: "Legacy Seeded Character", },),),).toBe(1,);
  });

  test("a user-type actor row is never adopted, even on matching display_name+owner_id", async () => {
    const { db, } = fixture;
    const ownerId = uid();
    // The user's own actor row from registration (src/routes/auth/register.ts):
    // same display_name and owner_id a character seeded by the legacy code
    // would carry, but actor_type is "user".
    await db.insertInto("users",).values({
      id: ownerId,
      username: ownerId,
      display_name: "Namesake Character",
      password_hash: "hash",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();

    await db
      .insertInto("actors",)
      .values({
        id: uid(),
        actor_type: "user",
        display_name: "Namesake Character",
        user_id: ownerId,
        owner_id: ownerId,
        agent_type: "none",
        description: null,
        visibility: "private",
        settings: "{}",
        import_spec: "template",
        data_source_format: "json",
        data_raw: null,
        format_version: 0,
      },)
      .execute();

    // The legacy (owner, display_name) lookup must not mistake the user row
    // for the character: no character-typed row exists yet, so adoption
    // finds nothing and the seed path creates a fresh character instead.
    const legacy = { ownerId, seededAs: "Namesake Character", };
    expect(await findExistingActor(db, stableTemplateId({ name: "Namesake Character", },), legacy,),).toBeNull();

    const seeded = await seedCharacterTemplates(db, {
      enabled: true,
      templates: [{ name: "Namesake Character", description: "Pre-upgrade row", },],
    },);

    expect(seeded,).toEqual({ created: 1, skipped: 0, errors: [], },);

    // Once the character-typed row exists, it is found and adopted as usual.
    const characterRow = await db
      .selectFrom("actors",)
      .select("id",)
      .where("actor_type", "=", "character",)
      .where("display_name", "=", "Namesake Character",)
      .executeTakeFirst();

    expect(characterRow,).toBeDefined();
    // Once the character-typed row exists, it is found by its stable id
    // (fresh rows carry the deterministic id, so no adoption is needed).
    expect(await findExistingActor(db, stableTemplateId({ name: "Namesake Character", },), legacy,),).toEqual({
      id: characterRow!.id,
      needsAdoption: false,
    },);
  });

  test("distinct names sharing a slug still seed distinct rows", async () => {
    const { db, } = fixture;
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        { name: "Dr. Thorne", description: "built-in spelling", },
        { name: "Dr.Thorne", description: "same slug, different string", },
      ],
    };

    // A slug alone would collide both onto `tpl-dr-thorne` and silently seed
    // one row; the digest keeps them apart.
    const seeded = await seedCharacterTemplates(db, config,);
    expect(seeded,).toEqual({ created: 2, skipped: 0, errors: [], },);
    expect(await countByName("Dr. Thorne",),).toBe(1,);
    expect(await countByName("Dr.Thorne",),).toBe(1,);
  });

  // ── Direct identity-function tests (import-edge coverage) ──

  describe("slugifyName", () => {
    test("collapses non-alphanumeric runs to hyphens", () => {
      expect(slugifyName("Dr. Thorne",),).toBe("dr-thorne",);
    });

    test("lowerCases input", () => {
      expect(slugifyName("Test User",),).toBe("test-user",);
    });

    test("trims leading/trailing hyphens from collapsed runs", () => {
      expect(slugifyName("  Spaces  ",),).toBe("spaces",);
    });
  });

  describe("findExistingActor", () => {
    test("returns null when no row matches the legacy identity", async () => {
      const { db, } = fixture;
      const result = await findExistingActor(db, "no-such-id", {
        seededAs: "Ghost Character",
        ownerId: null,
      },);

      expect(result,).toBeNull();
    });
  });

  describe("adoptExistingActor", () => {
    test("stamps seedKey into settings of a legacy row", async () => {
      const { db, } = fixture;
      const legacyId = uid();
      await db
        .insertInto("actors",)
        .values({
          id: legacyId,
          actor_type: "character",
          display_name: "Adopted Direct",
          user_id: null,
          owner_id: null,
          agent_type: "ai",
          description: "",
          visibility: "public",
          settings: JSON.stringify({ is_template: false, is_default: false, },),
          import_spec: "template",
          data_source_format: "json",
          data_raw: null,
          format_version: 0,
        },)
        .execute();

      await adoptExistingActor(db, legacyId, "direct-test-key",);

      const row = await db
        .selectFrom("actors",)
        .select("settings",)
        .where("id", "=", legacyId,)
        .executeTakeFirst();

      expect(row,).not.toBeUndefined();

      const settings = JSON.parse(row!.settings as string,);
      expect(settings.seedKey,).toBe("direct-test-key",);
    });
  });
});
