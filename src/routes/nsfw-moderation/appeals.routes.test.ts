/**
 * Route tests for NSFW moderation-action appeal endpoints.
 *
 * Covers:
 *   - POST /api/nsfw/moderation/appeals — self-only submit; non-owner
 *     callers (who are not admin) are forbidden; admin can submit on
 *     behalf of any user.
 *   - GET /api/nsfw/moderation/appeals/me — self only.
 *   - GET /api/nsfw/moderation/appeals/pending — moderator/admin
 *     only; non-moderator roles denied.
 *   - PUT /api/nsfw/moderation/appeals/:id/review — moderator/admin
 *     only; reviewer is taken from the session, never the body.
 *   - POST /api/nsfw/moderation/appeals/:id/execute — `admin.users`
 *     capability AND `executedBy !== approvedBy`. Plain admins
 *     without `admin.users` are denied.
 *
 * The dual-admin guard is enforced inside the service
 * (`executeReversal` throws when executedBy === approvedBy); this
 * layer verifies the route wires that invariant correctly.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { appealsRoutes, } from "./appeals";

function createApp(
  db: Kysely<DB>,
  userId: string | null,
  role = "user",
): Elysia {
  return new Elysia({ name: "test-appeals", },)
    .derive(() => ({ userId, userRole: role, }))
    .use(appealsRoutes({ database: db, },),) as unknown as Elysia;
}

function seedAction(
  db: Kysely<DB>,
  id: string,
  targetUserId: string,
): Promise<unknown> {
  return db.insertInto("moderation_actions",).values({
    id,
    action_type: "block",
    target_user_id: targetUserId,
    performed_by: "admin-x",
    reason: "spam",
    scope: "user",
    metadata: "{}",
  },).execute();
}

function submitRequest(body: Record<string, unknown>,): Request {
  return new Request("http://localhost/api/nsfw/moderation/appeals", {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("nsfw moderation appeal routes", () => {
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

  test("POST requires auth", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      submitRequest({ actionId: "a-1", reason: "r", },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST self-appeal: caller owns the action → 200", async () => {
    const sessionUser = uid();
    const actionId = `act-${uid()}`;
    await seedAction(db, actionId, sessionUser,);
    const app = createApp(db, sessionUser,);
    const res = await app.handle(
      submitRequest({ actionId, reason: "mistake", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.data.id,).toBeString();
    expect(body.data.status,).toBe("pending",);
  });

  test("POST non-owner: caller does NOT own the action → 403", async () => {
    const owner = uid();
    const attacker = uid();
    const actionId = `act-${uid()}`;
    await seedAction(db, actionId, owner,);
    const app = createApp(db, attacker, "user",);
    const res = await app.handle(
      submitRequest({ actionId, reason: "x", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST admin can submit on behalf of any target", async () => {
    const owner = uid();
    const actionId = `act-${uid()}`;
    await seedAction(db, actionId, owner,);
    const app = createApp(db, uid(), "admin",);
    const res = await app.handle(
      submitRequest({ actionId, reason: "y", },),
    );
    expect(res.status,).toBe(200,);
  });

  test("GET /me returns caller's appeals", async () => {
    const owner = uid();
    const actionId = `act-${uid()}`;
    await seedAction(db, actionId, owner,);
    const app = createApp(db, owner,);
    await app.handle(submitRequest({ actionId, reason: "first", },),);
    const res = await app.handle(
      new Request("http://localhost/api/nsfw/moderation/appeals/me",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(Array.isArray(body.data,),).toBe(true,);
    expect(body.data.length,).toBeGreaterThan(0,);
  });

  test("GET /pending denied for plain user", async () => {
    const app = createApp(db, uid(), "user",);
    const res = await app.handle(
      new Request("http://localhost/api/nsfw/moderation/appeals/pending",),
    );
    expect(res.status,).toBe(403,);
  });

  test("GET /pending returns pending list for admin", async () => {
    const app = createApp(db, uid(), "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/nsfw/moderation/appeals/pending",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(Array.isArray(body.data,),).toBe(true,);
  });

  test("PUT /:id/review denied for plain user", async () => {
    const app = createApp(db, uid(), "user",);
    const res = await app.handle(
      new Request("http://localhost/api/nsfw/moderation/appeals/x/review", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ status: "denied", reviewNote: "no", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("PUT /:id/review by admin sets appeal status; reviewer from session", async () => {
    const owner = uid();
    const actionId = `act-${uid()}`;
    await seedAction(db, actionId, owner,);
    const sessionUser = uid();
    const ownerApp = createApp(db, owner,);
    const submit = await ownerApp.handle(
      submitRequest({ actionId, reason: "x", },),
    );
    const { data: appeal, } = await submit.json() as { data: { id: string } };

    const adminApp = createApp(db, sessionUser, "admin",);
    const res = await adminApp.handle(
      new Request(
        `http://localhost/api/nsfw/moderation/appeals/${appeal.id}/review`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ status: "denied", reviewNote: "no", },),
        },
      ),
    );
    expect(res.status,).toBe(200,);

    // Verify session user is the reviewer in the DB row.
    const row = await db.selectFrom("moderation_appeals",).selectAll()
      .where("id", "=", appeal.id,).executeTakeFirst();
    expect(row?.reviewed_by,).toBe(sessionUser,);
  });

  test("POST /:id/execute denied for plain admin (no admin.users)", async () => {
    // 'moderator' role lacks admin.users
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(
      new Request("http://localhost/api/nsfw/moderation/appeals/x/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ approvedBy: "some-admin", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST /:id/execute rejected when executedBy === approvedBy", async () => {
    const owner = uid();
    const actionId = `act-${uid()}`;
    await seedAction(db, actionId, owner,);
    const adminId = uid();
    // 1) Owner submits appeal.
    const ownerApp = createApp(db, owner,);
    const submit = await ownerApp.handle(
      submitRequest({ actionId, reason: "x", },),
    );
    const { data: appeal, } = await submit.json() as { data: { id: string } };
    // 2) Same admin reviews AND tries to execute (should be blocked).
    const adminApp = createApp(db, adminId, "admin",);
    await adminApp.handle(
      new Request(
        `http://localhost/api/nsfw/moderation/appeals/${appeal.id}/review`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ status: "approved", reviewNote: "ok", },),
        },
      ),
    );
    const exec = await adminApp.handle(
      new Request(
        `http://localhost/api/nsfw/moderation/appeals/${appeal.id}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ approvedBy: adminId, },),
        },
      ),
    );
    expect(exec.status,).toBe(400,);
  });
});
