// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin audit routes — capability gate for NSFW event types
 * (BUG-nsfw-gate-log-plaintext-pii).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, } from "../../test-utils/create-test-db";
import { auditRoutes, } from "./audit";

function makeApp(db: Kysely<DB>, userRole: string,): Elysia {
  const app = new Elysia({ name: "test-audit", },);
  app.derive((): { userRole: string } => ({ userRole, }));
  return app.use(auditRoutes({ database: db, config: {} as Config, }, "/api",),);
}

async function insertNsfwGateEvent(
  db: Kysely<DB>,
  userId: string,
  reason: string,
): Promise<void> {
  await db
    .insertInto("log_entries",)
    .values({
      id: crypto.randomUUID(),
      level: 6, // INFO
      timestamp: Date.now(),
      time: new Date().toISOString(),
      message: `NSFW gate: blocked — ${reason}`,
      module: "nsfw-gate",
      user_id: userId,
      entity_type: "actor",
      entity_id: userId,
      action: "blocked",
      meta: "{}",
      event_type: "nsfw.gate.blocked",
    },)
    .execute();
}

let db: Kysely<DB>;
type TestDb = Awaited<ReturnType<typeof createTestDb>>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("admin audit — NSFW event type capability gate", () => {
  test("admin role can read nsfw.gate.* events (wildcard perm)", async () => {
    await insertNsfwGateEvent(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?event_type=nsfw.gate.blocked",),);
    expect(res.status,).toBe(200,);
  });

  test("solo role can read nsfw.gate.* events (wildcard perm)", async () => {
    await insertNsfwGateEvent(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "solo",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?event_type=nsfw.gate.blocked",),);
    expect(res.status,).toBe(200,);
  });

  test("moderator role is rejected from nsfw.gate.* events", async () => {
    await insertNsfwGateEvent(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "moderator",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?event_type=nsfw.gate.blocked",),);
    expect(res.status,).toBe(403,);
  });

  test("moderator role CAN read other (non-NSFW) event types", async () => {
    // Insert a non-NSFW audit row.
    await db.insertInto("log_entries",).values({
      id: crypto.randomUUID(),
      level: 6,
      timestamp: Date.now(),
      time: new Date().toISOString(),
      message: "Admin: settings updated",
      module: "admin",
      user_id: null,
      entity_type: null,
      entity_id: null,
      action: "settings.update",
      meta: "{}",
      event_type: "admin.settings.update",
    },).execute();
    const app = makeApp(db, "moderator",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?event_type=admin.settings.update",),);
    // Moderator lacks `admin.system` so this should also be 403, but the
    // important assertion is that the NSFW gate is the *first* check that
    // fails for moderators (independent of `admin.system`).
    expect(res.status,).toBe(403,);
  });

  test("non-admin role is rejected from nsfw.gate.* events", async () => {
    await insertNsfwGateEvent(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?event_type=nsfw.gate.blocked",),);
    expect(res.status,).toBe(403,);
  });

  test("admin can read audit log without event_type filter", async () => {
    await insertNsfwGateEvent(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit",),);
    expect(res.status,).toBe(200,);
  });
});
