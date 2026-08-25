/**
 * Tests for nsfw/moderation-service/preferences.ts
 *
 * Verifies the split between read-only `get` (no side effect) and
 * `getOrCreateOwn` (write semantics). BUG-nsfw-preferences-admin-read-
 * materializes-row required that admin reads never silently INSERT a
 * phantom row for a never-configured user.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { Logger, } from "../../logger";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { get, getOrCreateOwn, updatePreferences, } from "./preferences";
import type { NsfwModerationServiceContext, } from "./types";

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];

function makeLog(): Logger {
  return {
    trace: mock(() => {},),
    debug: mock(() => {},),
    info: mock(() => {},),
    warn: mock(() => {},),
    error: mock(() => {},),
    fatal: mock(() => {},),
    child: mock(() => makeLog()),
  } as unknown as Logger;
}

function makeCtx(): NsfwModerationServiceContext {
  return { db, log: makeLog(), } as unknown as NsfwModerationServiceContext;
}

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(async () => {
  db.destroy();
},);

describe("get", () => {
  test("returns null when no row exists and never writes", async () => {
    const result = await get({ thisL: makeCtx(), userId: "ghost-user", },);
    expect(result,).toBeNull();

    const row = await db
      .selectFrom("nsfw_user_preferences",)
      .select("user_id",)
      .where("user_id", "=", "ghost-user",)
      .executeTakeFirst();
    expect(row,).toBeUndefined();
  });
});

describe("getOrCreateOwn", () => {
  test("creates a default row on first call for a new user", async () => {
    const result = await getOrCreateOwn({ thisL: makeCtx(), userId: "fresh-user", },);
    expect(result.userId,).toBe("fresh-user",);
    expect(result.accessStatus,).toBe("clear",);

    const row = await db
      .selectFrom("nsfw_user_preferences",)
      .selectAll()
      .where("user_id", "=", "fresh-user",)
      .executeTakeFirst();
    expect(row?.user_id,).toBe("fresh-user",);
  });

  test("returns the existing row on subsequent calls without re-inserting", async () => {
    const first = await getOrCreateOwn({ thisL: makeCtx(), userId: "returning-user", },);
    const second = await getOrCreateOwn({ thisL: makeCtx(), userId: "returning-user", },);
    expect(second.id,).toBe(first.id,);
    expect(second.createdAt,).toBe(first.createdAt,);
  });
});

describe("updatePreferences", () => {
  test("self-update creates the row on first write", async () => {
    const prefs = await updatePreferences({
      thisL: makeCtx(),
      userId: "self-user",
      updates: { nsfwEnabled: true, },
    },);
    expect(prefs.nsfwEnabled,).toBe(true,);
  });
});
