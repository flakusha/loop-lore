/**
 * Route tests for `/api/nsfw/moderation/audit/:userId`,
 * `/api/nsfw/moderation/export/:userId` (GET), and
 * `/api/nsfw/moderation/export/:userId` (DELETE).
 *
 * Moderator permission gating: GET audit accepts the `moderator` role
 * (read surface) in addition to `admin`/`solo`/`tester`. GDPR export/delete
 * remain admin-only because they touch data subject rights.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { auditRoutes, } from "./audit";

/**
 * @param db
 * @param userId
 * @param role
 */
function createApp(db: Kysely<DB>, userId: string | null, role = "user",): Elysia {
  return new Elysia({ name: "test-audit", },)
    .derive(() => ({ userId, userRole: role, }))
    .use(auditRoutes({ database: db, },),) as unknown as Elysia;
}

describe("moderation audit routes — moderator gating", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET audit requires auth", async () => {
    const app = createApp(db, null, "moderator",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(401,);
  });

  test("GET audit denies user role", async () => {
    const app = createApp(db, uid(), "user",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(403,);
  });

  test("GET audit denies player role", async () => {
    const app = createApp(db, uid(), "player",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(403,);
  });

  test("GET audit denies viewer role", async () => {
    const app = createApp(db, uid(), "viewer",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(403,);
  });

  test("GET audit denies guest role", async () => {
    const app = createApp(db, uid(), "guest",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(403,);
  });

  test("GET audit denies bot role", async () => {
    const app = createApp(db, uid(), "bot",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(403,);
  });

  test("GET audit denies creator role", async () => {
    const app = createApp(db, uid(), "creator",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(403,);
  });

  test("GET audit accepts moderator role", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(200,);
  });

  test("GET audit accepts admin role", async () => {
    const app = createApp(db, uid(), "admin",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(200,);
  });

  test("GET audit accepts solo role", async () => {
    const app = createApp(db, uid(), "solo",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(200,);
  });

  test("GET audit accepts tester role", async () => {
    const app = createApp(db, uid(), "tester",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/audit/u-1",),);
    expect(res.status,).toBe(200,);
  });

  // GDPR export/delete remain admin-only.

  test("GET export denies moderator role (admin-only GDPR)", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/export/u-1",),);
    expect(res.status,).toBe(403,);
  });

  test("GET export accepts admin role", async () => {
    const app = createApp(db, uid(), "admin",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/export/u-1",),);
    expect(res.status,).toBe(200,);
  });

  test("DELETE export denies moderator role (admin-only GDPR)", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(
      new Request("http://localhost/api/nsfw/moderation/export/u-1", { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("DELETE export accepts admin role", async () => {
    const app = createApp(db, uid(), "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/nsfw/moderation/export/u-1", { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
  });
});
