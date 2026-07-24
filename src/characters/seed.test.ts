// src/characters/seed.test.ts — Unit tests for character template seeder

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
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
});
