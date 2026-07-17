/**
 * Tests for admin/config.ts — System Config CRUD
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, sql } from "kysely";
import { createTestDb } from "../test-utils/create-test-db";
import { getAllConfig, getConfig, setConfig, deleteConfig } from "./config";
import { createLogger } from "../logger";
import type { DB } from "../db/schema";

async function createSystemConfigTable(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("system_config")
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();
}

describe("getAllConfig", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn" });
    db = createTestDb();
    await createSystemConfigTable(db);
    await db.insertInto("system_config").values({ key: "foo", value: "bar" }).execute();
    await db.insertInto("system_config").values({ key: "baz", value: "qux" }).execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("returns all config entries", async () => {
    const entries = await getAllConfig(db);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.key === "foo")?.value).toBe("bar");
    expect(entries.find((e) => e.key === "baz")?.value).toBe("qux");
  });
});

describe("getConfig", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDb();
    await createSystemConfigTable(db);
    await db
      .insertInto("system_config")
      .values({ key: "foo", value: "bar", description: "Test key" })
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("returns config by key", async () => {
    const entry = await getConfig(db, "foo");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("bar");
    expect(entry!.description).toBe("Test key");
  });

  test("returns undefined for missing key", async () => {
    const entry = await getConfig(db, "nonexistent");
    expect(entry).toBeUndefined();
  });
});

describe("setConfig", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDb();
    await createSystemConfigTable(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("creates new config entry", async () => {
    await setConfig(db, "new_key", "new_value", "A new key");
    const entry = await getConfig(db, "new_key");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("new_value");
    expect(entry!.description).toBe("A new key");
  });

  test("updates existing config entry", async () => {
    await setConfig(db, "new_key", "updated_value");
    const entry = await getConfig(db, "new_key");
    expect(entry!.value).toBe("updated_value");
  });
});

describe("deleteConfig", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDb();
    await createSystemConfigTable(db);
    await db.insertInto("system_config").values({ key: "delete_me", value: "bye" }).execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("deletes config entry", async () => {
    await deleteConfig(db, "delete_me");
    const entry = await getConfig(db, "delete_me");
    expect(entry).toBeUndefined();
  });
});
