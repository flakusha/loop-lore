// src/characters/seed.test.ts — Unit tests for character template seeder

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { tmpdir, } from "node:os";
import type { CharactersConfig, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { mergeCharacterTemplates, seedCharacterTemplates, } from "./seed";

describe("mergeCharacterTemplates", () => {
  test("merges built-in defaults with user templates", () => {
    const defaults: CharactersConfig["templates"] = [
      { name: "Default 1", description: "Default character", },
    ];
    const userTemplates: CharactersConfig["templates"] = [
      { name: "User 1", description: "User character", },
    ];

    const merged = mergeCharacterTemplates(defaults, userTemplates,);

    expect(merged.length,).toBe(2,);
    expect(merged[0]?.name,).toBe("Default 1",);
    expect(merged[1]?.name,).toBe("User 1",);
  });

  test("user templates override by name (case-insensitive)", () => {
    const defaults: CharactersConfig["templates"] = [
      { name: "Shared Character", description: "Default version", },
    ];
    const userTemplates: CharactersConfig["templates"] = [
      { name: "shared character", description: "User version", },
    ];

    const merged = mergeCharacterTemplates(defaults, userTemplates,);

    expect(merged.length,).toBe(1,);
    expect(merged[0]?.description,).toBe("User version",);
  });
});

describe("seedCharacterTemplates", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("seeds characters from config", async () => {
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        { name: "Test Character", description: "A test character", },
      ],
    };

    const result = await seedCharacterTemplates(db, config,);

    expect(result.created,).toBe(1,);
    expect(result.skipped,).toBe(0,);
    expect(result.errors.length,).toBe(0,);

    // Verify character exists in DB
    const actor = await db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", "Test Character",)
      .executeTakeFirst();

    expect(actor,).toBeDefined();
  });

  test("uses hard ID when provided", async () => {
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        { id: "tpl-hard-id-test", name: "Hard ID Test", description: "With hard ID", },
      ],
    };

    const result = await seedCharacterTemplates(db, config,);

    expect(result.created,).toBe(1,);

    // Verify hard ID was used
    const actor = await db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", "Hard ID Test",)
      .executeTakeFirst();

    expect(actor?.id,).toBe("tpl-hard-id-test",);
  });

  test("skips existing characters (idempotent)", async () => {
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        { name: "Test Character", description: "Already exists", },
      ],
    };

    // Second seed should skip
    const result = await seedCharacterTemplates(db, config,);

    expect(result.created,).toBe(0,);
    expect(result.skipped,).toBe(1,);
  });

  test("returns empty result when disabled", async () => {
    const config: CharactersConfig = {
      enabled: false,
      templates: [
        { name: "Should Not Exist", description: "Disabled", },
      ],
    };

    const result = await seedCharacterTemplates(db, config,);

    expect(result.created,).toBe(0,);
    expect(result.skipped,).toBe(0,);
  });

  test("returns empty result when no templates", async () => {
    const config: CharactersConfig = {
      enabled: true,
      templates: [],
    };

    const result = await seedCharacterTemplates(db, config,);

    expect(result.created,).toBe(0,);
    expect(result.skipped,).toBe(0,);
  });

  test("stores tags in settings JSON", async () => {
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        { name: "Tagged Character", description: "Has tags", tags: ["fantasy", "guide",], },
      ],
    };

    const result = await seedCharacterTemplates(db, config,);

    expect(result.created,).toBe(1,);

    // Verify settings JSON contains tags
    const actor = await db
      .selectFrom("actors",)
      .select("settings",)
      .where("display_name", "=", "Tagged Character",)
      .executeTakeFirst();

    expect(actor?.settings,).toContain("fantasy",);
    expect(actor?.settings,).toContain("guide",);
  });

  test("persists identity traits with categories and normalized species", async () => {
    const config: CharactersConfig = {
      enabled: true,
      templates: [
        {
          name: "Identity Character",
          description: "Has identity",
          species: "high elf",
          homeland: "whispering library",
          culture: "Old Tongue Scholar",
        },
      ],
    };

    const result = await seedCharacterTemplates(db, config,);
    expect(result.created,).toBe(1,);

    const actor = await db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", "Identity Character",)
      .executeTakeFirst();
    expect(actor,).toBeDefined();

    const traits = await db
      .selectFrom("character_permanent_traits",)
      .selectAll()
      .where("actor_id", "=", actor!.id,)
      .execute();

    const byName = Object.fromEntries(traits.map((t,) => [t.trait_name, t,]),);
    expect(byName["species"]?.trait_value,).toBe("High Elf",); // title-cased
    expect(byName["species"]?.trait_category,).toBe("identity",);
    expect(byName["homeland"]?.trait_value,).toBe("Whispering Library",); // title-cased
    expect(byName["homeland"]?.trait_category,).toBe("background",);
    expect(byName["culture"]?.trait_value,).toBe("Old Tongue Scholar",);
    expect(byName["culture"]?.trait_category,).toBe("background",);
  });

  test("does not write identity traits when identity fields omitted", async () => {
    const config: CharactersConfig = {
      enabled: true,
      templates: [{ name: "No Identity", description: "No traits", },],
    };

    const result = await seedCharacterTemplates(db, config,);
    expect(result.created,).toBe(1,);

    const actor = await db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", "No Identity",)
      .executeTakeFirst();
    expect(actor,).toBeDefined();

    const traits = await db
      .selectFrom("character_permanent_traits",)
      .selectAll()
      .where("actor_id", "=", actor!.id,)
      .execute();
    expect(traits.length,).toBe(0,);
  });

  test("creates avatar when avatar source + uploadDir supplied", async () => {
    const config: CharactersConfig = {
      enabled: true,
      templates: [{ name: "Avatar Character", description: "Has avatar", avatar: { type: "default", }, },],
    };
    const uploadDir = `${tmpdir()}/loop-lore-seed-avatar-${Date.now()}`;

    const result = await seedCharacterTemplates(db, config, null, uploadDir,);
    expect(result.created,).toBe(1,);
    expect(result.errors.length,).toBe(0,);

    const actor = await db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", "Avatar Character",)
      .executeTakeFirst();
    expect(actor,).toBeDefined();

    const avatar = await db
      .selectFrom("character_avatars",)
      .selectAll()
      .where("actor_id", "=", actor!.id,)
      .executeTakeFirst();
    expect(avatar,).toBeDefined();
    expect(avatar?.is_primary,).toBe(1,);

    const link = await db
      .selectFrom("asset_links",)
      .selectAll()
      .where("entity_id", "=", actor!.id,)
      .executeTakeFirst();
    expect(link,).toBeDefined();
    expect(link?.entity_type,).toBe("actor",);
  });

  test("does not create avatar when uploadDir omitted", async () => {
    const config: CharactersConfig = {
      enabled: true,
      templates: [{ name: "No Avatar Dir", description: "No avatar", avatar: { type: "default", }, },],
    };

    const result = await seedCharacterTemplates(db, config,);
    expect(result.created,).toBe(1,);

    const actor = await db
      .selectFrom("actors",)
      .select("id",)
      .where("display_name", "=", "No Avatar Dir",)
      .executeTakeFirst();
    expect(actor,).toBeDefined();

    const avatar = await db
      .selectFrom("character_avatars",)
      .selectAll()
      .where("actor_id", "=", actor!.id,)
      .executeTakeFirst();
    expect(avatar,).toBeUndefined();
  });
});
