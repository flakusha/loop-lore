import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Kysely, sql } from "kysely";
import { createSqliteDialect } from "./index";
import { seedDefaultActors } from "./seed";
import { createLogger } from "../logger";
import type { DB } from "./schema";

function createTestDb(): Kysely<DB> {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  const dialect = createSqliteDialect(sqlite);
  return new Kysely<DB>({ dialect });
}

async function createTables(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("actors")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("actor_type", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("agent_type", "text", (col) => col.notNull().defaultTo("none"))
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("system_prompt", "text")
    .addColumn("user_id", "text", (col) => col.references("users.id"))
    .addColumn("owner_id", "text", (col) => col.references("users.id"))
    .addColumn("avatar_asset_id", "text")
    .addColumn("visibility", "text", (col) => col.notNull().defaultTo("private"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("data_version", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("import_spec", "text", (col) => col.notNull().defaultTo("raw"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await db.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("username", "text", (col) => col.notNull().unique())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .execute();
}

describe("seedDefaultActors", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn" });
    db = createTestDb();
    await createTables(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("creates Assistant actor and demo user on fresh DB", async () => {
    await seedDefaultActors(db);

    const actor = await db
      .selectFrom("actors")
      .selectAll()
      .where("id", "=", "assistant-default")
      .executeTakeFirst();
    expect(actor).toBeDefined();
    expect(actor?.display_name).toBe("Assistant");

    const user = await db
      .selectFrom("users")
      .selectAll()
      .where("username", "=", "demo")
      .executeTakeFirst();
    expect(user).toBeDefined();
    expect(user?.role).toBe("solo");
  });

  test("is idempotent on second run", async () => {
    await seedDefaultActors(db);

    const actorCount = await db
      .selectFrom("actors")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirst();
    expect(actorCount?.n).toBe(1);

    const userCount = await db
      .selectFrom("users")
      .select(db.fn.countAll<number>().as("n"))
      .executeTakeFirst();
    expect(userCount?.n).toBe(1);
  });
});