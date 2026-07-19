/**
 * Tests for logger/transports/db.ts — DBTransport
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { createLogger, } from "../index";
import type { LogEntry, } from "../types";
import { DBTransport, } from "./db";

describe("DBTransport", () => {
  let db: Kysely<DB>;
  let transport: DBTransport;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    transport = new DBTransport(db,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("has name 'db'", () => {
    expect(transport.name,).toBe("db",);
  });

  test("write persists a log entry", async () => {
    const entry: LogEntry = {
      level: 20,
      timestamp: 1_800_000_000,
      time: "20260704T143000.123+02:00",
      message: "test entry",
      module: "test",
    };
    await transport.write(entry,);

    const rows = await db.selectFrom("log_entries",).selectAll().execute();
    expect(rows.length,).toBeGreaterThanOrEqual(1,);
    const last = rows[rows.length - 1]!;
    expect(last.message,).toBe("test entry",);
    expect(last.level,).toBe(20,);
    expect(last.module,).toBe("test",);
  });

  test("write with meta extracts event_type and entity", async () => {
    const entry: LogEntry = {
      level: 30,
      timestamp: 1_800_000_001,
      time: "20260704T143001.123+02:00",
      message: "user created",
      module: "admin",
      userId: "user-abc",
      meta: { event_type: "user", entity_type: "user", entity_id: "user-abc", action: "created", },
    };
    await transport.write(entry,);

    const rows = await db.selectFrom("log_entries",).selectAll().where("event_type", "=", "user",).execute();
    expect(rows.length,).toBeGreaterThanOrEqual(1,);
    const last = rows[rows.length - 1]!;
    expect(last.event_type,).toBe("user",);
    expect(last.entity_type,).toBe("user",);
    expect(last.entity_id,).toBe("user-abc",);
    expect(last.action,).toBe("created",);
    expect(last.user_id,).toBe("user-abc",);
  });

  test("write uses message as action when no meta.action", async () => {
    const entry: LogEntry = {
      level: 20,
      timestamp: 1_800_000_002,
      time: "20260704T143002.123+02:00",
      message: "test action",
    };
    await transport.write(entry,);

    const rows = await db.selectFrom("log_entries",).selectAll().where("action", "=", "test action",).execute();
    expect(rows.length,).toBeGreaterThanOrEqual(1,);
  });

  test("write does not throw on error (silent catch)", async () => {
    const badTransport = new DBTransport(db,);
    const entry: LogEntry = {
      level: 20,
      timestamp: 0,
      time: "x",
      message: "should not throw",
    };
    await expect(badTransport.write(entry,),).resolves.toBeUndefined();
  });

  test("flush returns resolved promise", async () => {
    await expect(transport.flush(),).resolves.toBeUndefined();
  });
});
