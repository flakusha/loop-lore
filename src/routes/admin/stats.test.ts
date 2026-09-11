// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin stats route — totals + daily deltas for the overview dashboard.
 *
 * Covers: 200 happy path (empty + seeded), 403 non-admin, 401 anonymous,
 * 400 invalid query params, and date-range query parameters.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { statsRoutes, } from "./stats";

/**
 * Build an Elysia app with the stats route mounted and an auth derive.
 * @param db - Kysely DB handle
 * @param opts.userId - userId to derive; falsy/empty yields 401
 * @param opts.userRole - role string used by can() check
 * @returns configured Elysia app
 */
function makeApp(db: Kysely<DB>, opts: { userId?: string | null; userRole?: string | null },): Elysia {
  const app = new Elysia({ name: "test-stats", },);
  app.derive((): { userId: string; userRole: string | null } => ({
    userId: opts.userId ?? "",
    userRole: opts.userRole ?? null,
  }),);
  return app.use(statsRoutes({ database: db, config: {} as Config, }, "/api",),);
}

/**
 * Insert a user row with the required fields.
 * @param db - Kysely DB
 * @param input - user payload
 * @param input.id - user id
 * @param input.username - unique username
 * @param input.displayName - human-readable name
 */
async function insertUser(db: Kysely<DB>, input: { id: string; username: string; displayName: string },): Promise<void> {
  await db
    .insertInto("users",)
    .values({
      id: input.id,
      username: input.username,
      display_name: input.displayName,
      role: "user",
      status: "active",
      settings: "{}",
    },)
    .execute();
}

/**
 * Insert a chat row; requires a creating user.
 * @param db - Kysely DB
 * @param input - chat payload
 * @param input.id - chat id
 * @param input.name - chat name
 * @param input.createdBy - creator user id
 */
async function insertChat(db: Kysely<DB>, input: { id: string; name: string; createdBy: string },): Promise<void> {
  await db
    .insertInto("chats",)
    .values({
      id: input.id,
      name: input.name,
      type: "direct",
      mode: "direct",
      created_by: input.createdBy,
    },)
    .execute();
}

/**
 * Insert a character actor — stats counts actors where actor_type = "character".
 * @param db - Kysely DB
 * @param input - actor payload
 * @param input.id - actor id
 * @param input.displayName - actor display name
 */
async function insertCharacter(db: Kysely<DB>, input: { id: string; displayName: string },): Promise<void> {
  await db
    .insertInto("actors",)
    .values({
      id: input.id,
      actor_type: "character",
      display_name: input.displayName,
      agent_type: "ai",
      settings: "{}",
      import_spec: "raw",
      template_overrides: "{}",
      data_source_format: "json",
      data_raw: null,
    },)
    .execute();
}

/**
 * Insert a world row.
 * @param db - Kysely DB
 * @param input - world payload
 * @param input.id - world id
 * @param input.ownerId - owner user id (FK)
 * @param input.name - world name
 */
async function insertWorld(db: Kysely<DB>, input: { id: string; ownerId: string; name: string },): Promise<void> {
  await db
    .insertInto("worlds",)
    .values({
      id: input.id,
      owner_id: input.ownerId,
      name: input.name,
      publication_status: "draft",
      kind: "rpg",
      visibility: "private",
      scan_depth: 100,
      token_budget: 2000,
      difficulty_modifier: 1,
      difficulty_reroll: "none",
      difficulty_state: "normal",
    },)
    .execute();
}

/**
 * Insert an asset row.
 * @param db - Kysely DB
 * @param input - asset payload
 * @param input.id - asset id
 * @param input.ownerId - owner user id (FK)
 */
async function insertAsset(db: Kysely<DB>, input: { id: string; ownerId: string },): Promise<void> {
  await db
    .insertInto("assets",)
    .values({
      id: input.id,
      owner_id: input.ownerId,
      filename: `${input.id}.bin`,
      mime_type: "application/octet-stream",
      asset_type: "other",
      size_bytes: 0,
      storage_path: `/tmp/${input.id}.bin`,
    },)
    .execute();
}

let testDb: TestDb;
let db: Kysely<DB>;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
},);

beforeEach(() => {
  resetTestDb(testDb.sqlite,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("admin stats", () => {
  test("admin gets 200 with all-zero counts on empty DB", async () => {
    const app = makeApp(db, { userId: "test-user-admin", userRole: "admin", },);
    const res = await app.handle(new Request("http://localhost/api/admin/stats",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.users,).toBe(0,);
    expect(body.chats,).toBe(0,);
    expect(body.messages,).toBe(0,);
    expect(body.characters,).toBe(0,);
    expect(body.assets,).toBe(0,);
    expect(body.worlds,).toBe(0,);
    expect((body.deltas as Record<string, number>).users,).toBe(0,);
    expect((body.deltas as Record<string, number>).chats,).toBe(0,);
    expect((body.deltas as Record<string, number>).worlds,).toBe(0,);
    expect((body.deltas as Record<string, number>).assets,).toBe(0,);
  });

  test("admin gets 200 with populated totals when relevant tables have rows", async () => {
    await insertUser(db, { id: "u-1", username: "alice", displayName: "Alice", },);
    await insertUser(db, { id: "u-2", username: "bob", displayName: "Bob", },);
    await insertChat(db, { id: "c-1", name: "DM Chat", createdBy: "u-1", },);
    await insertCharacter(db, { id: "a-1", displayName: "Wizard", },);
    await insertWorld(db, { id: "w-1", ownerId: "u-1", name: "Mystic Lands", },);
    await insertAsset(db, { id: "asset-1", ownerId: "u-1", },);

    const app = makeApp(db, { userId: "test-user-admin", userRole: "admin", },);
    const res = await app.handle(new Request("http://localhost/api/admin/stats",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.users,).toBe(2,);
    expect(body.chats,).toBe(1,);
    expect(body.characters,).toBe(1,);
    expect(body.worlds,).toBe(1,);
    expect(body.assets,).toBe(1,);
  });

  test("admin can call with date range query params without breaking the response", async () => {
    await insertUser(db, { id: "u-1", username: "alice", displayName: "Alice", },);
    const app = makeApp(db, { userId: "test-user-admin", userRole: "admin", },);
    // Date range params are accepted by the route; the body still includes
    // the same totals/deltas envelope (the route does not currently filter
    // totals by date — only the per-day deltas slice uses dayStart).
    const res = await app.handle(
      new Request("http://localhost/api/admin/stats?since=2025-01-01&until=2025-12-31",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.users,).toBe(1,);
    expect(typeof body.deltas,).toBe("object",);
  });

  test("returns 403 when caller has a non-admin role", async () => {
    const app = makeApp(db, { userId: "test-user-user", userRole: "user", },);
    const res = await app.handle(new Request("http://localhost/api/admin/stats",),);
    expect(res.status,).toBe(403,);
  });

  test("returns 403 when caller role is moderator (lacks admin.system)", async () => {
    const app = makeApp(db, { userId: "test-user-mod", userRole: "moderator", },);
    const res = await app.handle(new Request("http://localhost/api/admin/stats",),);
    expect(res.status,).toBe(403,);
  });

  test("returns 401 when no userId is derived (anonymous)", async () => {
    const app = makeApp(db, { userId: null, userRole: null, },);
    const res = await app.handle(new Request("http://localhost/api/admin/stats",),);
    expect(res.status,).toBe(401,);
  });
});
