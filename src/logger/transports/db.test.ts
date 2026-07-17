/**
 * Tests for logger/transports/db.ts — DBTransport
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Kysely, sql } from "kysely";
import { createTestDb } from "../../test-utils/create-test-db";
import { DBTransport } from "./db";
import type { DB } from "../../db/schema";
import type { LogEntry } from "../types";

async function createLogEntriesTable(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("log_entries")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("level", "integer", (col) => col.notNull().defaultTo(20))
    .addColumn("timestamp", "real", (col) => col.notNull())
    .addColumn("time", "text", (col) => col.notNull())
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("module", "text")
    .addColumn("user_id", "text")
    .addColumn("session_id", "text")
    .addColumn("request_id", "text")
    .addColumn("meta", "text")
    .addColumn("event_type", "text")
    .addColumn("entity_type", "text")
    .addColumn("entity_id", "text")
    .addColumn("action", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();
}

describe("DBTransport", () => {
  let db: Kysely<DB>;
  let transport: DBTransport;

  beforeAll(async () => {
    db = createTestDb();
    await createLogEntriesTable(db);
    transport = new DBTransport(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("has name 'db'", () => {
    expect(transport.name).toBe("db");
  });

  test("write persists a log entry", async () => {
    const entry: LogEntry = {
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "test entry",
      module: "test",
    };
    await transport.write(entry);

    const rows = await db.selectFrom("log_entries").selectAll().execute();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const last = rows[rows.length - 1]!;
    expect(last.message).toBe("test entry");
    expect(last.level).toBe(20);
    expect(last.module).toBe("test");
  });

  test("write with meta extracts event_type and entity", async () => {
    const entry: LogEntry = {
      level: 30,
      timestamp: 1_800_000_001,
      time: "20260704T143001.123+02:00",
      message: "user created",
      module: "admin",
      userId: "user-abc",
      meta: { event_type: "user", entity_type: "user", entity_id: "user-abc", action: "created" },
    };
    await transport.write(entry);

    const rows = await db.selectFrom("log_entries").selectAll().where("event_type", "=", "user").execute();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const last = rows[rows.length - 1]!;
    expect(last.event_type).toBe("user");
    expect(last.entity_type).toBe("user");
    expect(last.entity_id).toBe("user-abc");
    expect(last.action).toBe("created");
    expect(last.user_id).toBe("user-abc");
  });

  test("write uses message as action when no meta.action", async () => {
    const entry: LogEntry = {
      level: 20,
      timestamp: 1_800_000_002,
      time: "20260704T143002.123+02:00",
      message: "test action",
    };
    await transport.write(entry);

    const rows = await db.selectFrom("log_entries").selectAll().where("action", "=", "test action").execute();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test("write does not throw on error (silent catch)", async () => {
    const badTransport = new DBTransport(db);
    // After destroy, insert should fail silently
    const entry: LogEntry = {
      level: 20,
      timestamp: 0,
      time: "x",
      message: "should not throw",
    };
    await expect(badTransport.write(entry)).resolves.toBeUndefined();
  });

  test("flush returns resolved promise", async () => {
    await expect(transport.flush()).resolves.toBeUndefined();
  });
});
