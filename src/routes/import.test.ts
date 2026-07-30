// src/routes/import.test.ts
//
// Tests for character import with lorebook entries.

import { Database, } from "bun:sqlite";
import { describe, expect, it, } from "bun:test";
import { Kysely, sql, } from "kysely";
import { createSqliteDialect, } from "../db/index";
import { uid, } from "../utils";

/**
 * Create a minimal in-memory SQLite DB with the required tables.
 */
async function createTestDatabase() {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = ON",);

  const dialect = createSqliteDialect(sqlite,);
  const database = new Kysely<import("../db/schema").DB>({ dialect, },);

  // Create actors table
  await database.schema
    .createTable("actors",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_type", "text", (col,) => col.notNull(),)
    .addColumn("display_name", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text",)
    .addColumn("owner_id", "text",)
    .addColumn("agent_type", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("system_prompt", "text",)
    .addColumn("welcome_message", "text",)
    .addColumn("personality", "text",)
    .addColumn("scenario", "text",)
    .addColumn("mes_example", "text",)
    .addColumn("post_history_instructions", "text",)
    .addColumn("creator_notes", "text",)
    .addColumn("creator", "text",)
    .addColumn("character_version", "text",)
    .addColumn("import_spec", "text", (col,) => col.notNull(),)
    .addColumn("data_source_format", "text", (col,) => col.notNull(),)
    .addColumn("data_raw", "text",)
    .addColumn("alternate_greetings", "text",)
    .addColumn("settings", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  // Create actor_lore_entries table
  await database.schema
    .createTable("actor_lore_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("name", "text",)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("keys", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("secondary_keys", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("selective", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("case_sensitive", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("enabled", "text", (col,) => col.notNull().defaultTo("enabled",),)
    .addColumn("constant", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("position", "text", (col,) => col.notNull().defaultTo("before_char",),)
    .addColumn("insertion_order", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("comment", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("cooldown_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("last_activated", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  return database;
}

describe("lorebook import database operations", () => {
  it("creates lore entries linked to actor", async () => {
    const database = await createTestDatabase();
    const actorId = uid();

    // Create actor
    await database
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Test Character",
        user_id: "test-user-id",
        owner_id: "test-user-id",
        agent_type: "ai",
        description: "A test character",
        personality: "Friendly",
        import_spec: "ccv2",
        data_source_format: "ccv2",
        settings: "{}",
        data_version: 1,
      },)
      .execute();

    // Insert lore entries
    const loreEntries = [
      {
        keys: ["dragon", "wyrm",],
        content: "Dragons are ancient creatures.",
        enabled: true,
        insertion_order: 1,
        case_sensitive: false,
        name: "Dragon Lore",
        priority: 10,
        comment: "Dragon info",
        selective: false,
        constant: false,
        position: "before_char" as const,
      },
      {
        keys: ["elf", "elves",],
        content: "Elves are graceful beings.",
        enabled: true,
        insertion_order: 2,
        case_sensitive: false,
        name: "Elf Lore",
        priority: 5,
        comment: "Elf info",
        selective: true,
        constant: false,
        position: "after_char" as const,
      },
    ];

    for (const entry of loreEntries) {
      await database
        .insertInto("actor_lore_entries",)
        .values({
          id: uid(),
          actor_id: actorId,
          name: entry.name || null,
          content: entry.content,
          keys: JSON.stringify(entry.keys,),
          secondary_keys: "[]",
          selective: entry.selective ? 1 : 0,
          case_sensitive: entry.case_sensitive ? 1 : 0,
          enabled: entry.enabled ? "enabled" : "disabled",
          constant: entry.constant ? 1 : 0,
          position: entry.position,
          insertion_order: entry.insertion_order,
          priority: entry.priority,
          comment: entry.comment ?? null,
          sort_order: 0,
        },)
        .execute();
    }

    // Verify lore entries in database
    const entries = await database
      .selectFrom("actor_lore_entries",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .execute();

    expect(entries,).toHaveLength(2,);

    const dragonEntry = entries.find((e,) => e.name === "Dragon Lore");
    expect(dragonEntry,).toBeDefined();
    expect(dragonEntry?.content,).toBe("Dragons are ancient creatures.",);
    expect(JSON.parse(dragonEntry?.keys ?? "[]",),).toEqual(["dragon", "wyrm",],);
    expect(dragonEntry?.enabled,).toBe("enabled",);
    expect(dragonEntry?.position,).toBe("before_char",);
    expect(dragonEntry?.selective,).toBe(0,);

    const elfEntry = entries.find((e,) => e.name === "Elf Lore");
    expect(elfEntry,).toBeDefined();
    expect(elfEntry?.content,).toBe("Elves are graceful beings.",);
    expect(JSON.parse(elfEntry?.keys ?? "[]",),).toEqual(["elf", "elves",],);
    expect(elfEntry?.enabled,).toBe("enabled",);
    expect(elfEntry?.position,).toBe("after_char",);
    expect(elfEntry?.selective,).toBe(1,);
  });

  it("handles disabled lore entries", async () => {
    const database = await createTestDatabase();
    const actorId = uid();

    await database
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Test Character",
        user_id: "test-user-id",
        owner_id: "test-user-id",
        agent_type: "ai",
        description: "A test character",
        import_spec: "ccv2",
        data_source_format: "ccv2",
        settings: "{}",
        data_version: 1,
      },)
      .execute();

    await database
      .insertInto("actor_lore_entries",)
      .values({
        id: uid(),
        actor_id: actorId,
        name: "Disabled Entry",
        content: "This entry is disabled",
        keys: JSON.stringify(["disabled",],),
        secondary_keys: "[]",
        selective: 0,
        case_sensitive: 0,
        enabled: "disabled",
        constant: 0,
        position: "before_char",
        insertion_order: 1,
        priority: 0,
        sort_order: 0,
      },)
      .execute();

    const entries = await database
      .selectFrom("actor_lore_entries",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .execute();

    expect(entries,).toHaveLength(1,);
    expect(entries[0]?.enabled,).toBe("disabled",);
  });

  it("cascades delete lore entries when actor is deleted", async () => {
    const database = await createTestDatabase();
    const actorId = uid();

    await database
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Test Character",
        user_id: "test-user-id",
        owner_id: "test-user-id",
        agent_type: "ai",
        description: "A test character",
        import_spec: "ccv2",
        data_source_format: "ccv2",
        settings: "{}",
        data_version: 1,
      },)
      .execute();

    await database
      .insertInto("actor_lore_entries",)
      .values({
        id: uid(),
        actor_id: actorId,
        name: "To Be Deleted",
        content: "This will be deleted",
        keys: JSON.stringify(["delete",],),
        secondary_keys: "[]",
        selective: 0,
        case_sensitive: 0,
        enabled: "enabled",
        constant: 0,
        position: "before_char",
        insertion_order: 1,
        priority: 0,
        sort_order: 0,
      },)
      .execute();

    // Verify entry exists
    let entries = await database
      .selectFrom("actor_lore_entries",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .execute();
    expect(entries,).toHaveLength(1,);

    // Delete actor (should cascade)
    await database
      .deleteFrom("actors",)
      .where("id", "=", actorId,)
      .execute();

    // Verify entry is deleted
    entries = await database
      .selectFrom("actor_lore_entries",)
      .where("actor_id", "=", actorId,)
      .selectAll()
      .execute();
    expect(entries,).toHaveLength(0,);
  });
});
