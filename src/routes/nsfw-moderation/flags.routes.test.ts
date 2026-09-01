/**
 * Route tests for the content-flag endpoints.
 *
 * Covers:
 *   - Reporter-identity hardening: `reporterId` is derived from the
 *     authenticated session, never the request body.
 *   - Moderator permission gating: GET /flags (review) and PUT /flags/:id
 *     (action) accept the `moderator` role in addition to `admin`/`solo`/`tester`.
 *     Non-moderator roles (user/player/viewer/guest/bot/creator) are denied.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { flagsRoutes, } from "./flags";

/**
 * @param db
 * @param userId
 * @param role
 */
function createApp(db: Kysely<DB>, userId: string | null, role = "user",): Elysia {
  return new Elysia({ name: "test-flags", },)
    .derive(() => ({ userId, userRole: role, }))
    .use(flagsRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param body
 */
function flagRequest(body: Record<string, unknown>,): Request {
  return new Request("http://localhost/api/nsfw/moderation/flags", {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("content flag routes", () => {
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

  test("POST /api/nsfw/moderation/flags requires auth", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(flagRequest({ contentType: "message", contentId: "m1", flagReason: "spam", },),);
    expect(res.status,).toBe(401,);
  });

  test("POST derives reporterId from the session, not the body — response is redacted (no reporterId)", async () => {
    const sessionUser = uid();
    const app = createApp(db, sessionUser,);
    // Body cannot carry reporterId (schema rejects it); session user is used.
    const res = await app.handle(
      flagRequest({ contentType: "message", contentId: `m-${uid()}`, chatId: "chat-1", flagReason: "spam", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json();
    const flag = body.data;
    // Response MUST NOT include reporterId or contentIds (PII guard).
    expect(flag.reporterId,).toBeUndefined();
    expect(flag.contentId,).toBeUndefined();
    expect(flag.chatId,).toBeUndefined();
    expect(flag.worldId,).toBeUndefined();
    expect(flag.description,).toBeUndefined();
    // DB row records the session user as the reporter.
    const row = await db.selectFrom("content_flags",).selectAll().where("id", "=", flag.id,).executeTakeFirst();
    expect(row?.reporter_id,).toBe(sessionUser,);
    // Redacted view surfaces a stable hash.
    expect(flag.reporterHash,).toMatch(/^rh_[a-f0-9]{32}$/,);
  });

  test("POST ignores a spoofed reporterId in the body — session user wins", async () => {
    const sessionUser = uid();
    const app = createApp(db, sessionUser,);
    const res = await app.handle(
      flagRequest({ reporterId: "victim-user", contentType: "message", contentId: "x", flagReason: "spam", },),
    );
    // Schema strips unknown `reporterId` — request succeeds with session user as reporter.
    expect(res.status,).toBe(200,);
    const body = await res.json();
    const flag = body.data;
    const row = await db.selectFrom("content_flags",).selectAll().where("id", "=", flag.id,).executeTakeFirst();
    expect(row?.reporter_id,).toBe(sessionUser,);
    expect(row?.reporter_id,).not.toBe("victim-user",);
    expect(flag.reporterId,).toBeUndefined();
  });

  test("GET queue requires admin", async () => {
    const app = createApp(db, uid(), "user",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(403,);
  });

  test("GET queue returns flags for admin", async () => {
    const sessionUser = uid();
    const app = createApp(db, sessionUser, "admin",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags?status=pending",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    const { flags, total, } = body.data;
    expect(Array.isArray(flags,),).toBe(true,);
    expect(typeof total,).toBe("number",);
  });

  // ── Moderator permission gating ────────────────────────────

  test("GET queue denies user role", async () => {
    const app = createApp(db, uid(), "user",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(403,);
  });

  test("GET queue denies player role", async () => {
    const app = createApp(db, uid(), "player",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(403,);
  });

  test("GET queue denies viewer role", async () => {
    const app = createApp(db, uid(), "viewer",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(403,);
  });

  test("GET queue denies guest role", async () => {
    const app = createApp(db, uid(), "guest",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(403,);
  });

  test("GET queue denies bot role", async () => {
    const app = createApp(db, uid(), "bot",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(403,);
  });

  test("GET queue denies creator role", async () => {
    const app = createApp(db, uid(), "creator",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(403,);
  });

  test("GET queue accepts moderator role", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags?status=pending",),);
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(Array.isArray(body.data.flags,),).toBe(true,);
  });

  test("GET queue accepts solo role", async () => {
    const app = createApp(db, uid(), "solo",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(200,);
  });

  test("GET queue accepts tester role", async () => {
    const app = createApp(db, uid(), "tester",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(200,);
  });

  test("GET queue requires auth", async () => {
    const app = createApp(db, null, "moderator",);
    const res = await app.handle(new Request("http://localhost/api/nsfw/moderation/flags",),);
    expect(res.status,).toBe(401,);
  });

  // PUT /flags/:id (resolve) requires moderation.action

  /**
   * @param flagId
   * @param body
   */
  function resolveRequest(flagId: string, body: Record<string, unknown>,): Request {
    return new Request(`http://localhost/api/nsfw/moderation/flags/${flagId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },);
  }

  test("PUT /flags/:id denies user role", async () => {
    const app = createApp(db, uid(), "user",);
    const res = await app.handle(resolveRequest("flag-1", { resolution: "kept", status: "resolved", },),);
    expect(res.status,).toBe(403,);
  });

  test("PUT /flags/:id denies viewer role", async () => {
    const app = createApp(db, uid(), "viewer",);
    const res = await app.handle(resolveRequest("flag-1", { resolution: "kept", status: "resolved", },),);
    expect(res.status,).toBe(403,);
  });

  test("PUT /flags/:id accepts moderator role", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(resolveRequest("nonexistent-flag", { resolution: "kept", status: "resolved", },),);
    // Resolves to 400 (flag not found) once auth passes — confirms moderator reached the handler.
    expect(res.status,).toBe(400,);
  });

  // ── resolveFlagBody schema enum (runtime validation) ─────────────
  //
  // BUG-resolveflagbody-schema-allows-upheld-but-service-type-expect:
  // The schema enum must match NsfwModerationService.resolveFlag which
  // accepts only "resolved" | "dismissed" | "confirmed". At runtime Elysia
  // validates request bodies against the body schema BEFORE the handler
  // runs, so an invalid status returns 422 (schema failure), not 400
  // (handler failure). These tests pin the wire contract.

  test("PUT /flags/:id rejects status='upheld' (legacy, not in service contract)", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(resolveRequest("any-flag", { resolution: "kept", status: "upheld", },),);
    // Elysia returns 422 when body schema validation fails — handler is NOT reached.
    expect(res.status,).toBe(422,);
  });

  test("PUT /flags/:id rejects unknown status values", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(resolveRequest("any-flag", { resolution: "kept", status: "approved", },),);
    expect(res.status,).toBe(422,);
  });

  test("PUT /flags/:id accepts status='confirmed' (canonical disposition)", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(resolveRequest("nonexistent-flag-id", { resolution: "kept", status: "confirmed", },),);
    // Schema accepts 'confirmed'; handler runs and returns 400 (flag not found).
    // The 400 distinguishes handler-reached from schema-rejected (which is 422).
    expect(res.status,).toBe(400,);
  });

  test("PUT /flags/:id still accepts status='resolved' and 'dismissed'", async () => {
    const app = createApp(db, uid(), "moderator",);
    for (const status of ["resolved", "dismissed",]) {
      const res = await app.handle(resolveRequest(`nonexistent-${status}`, { resolution: "n/a", status, },),);
      expect(res.status,).toBe(400,);
    }
  });

  test("PUT /flags/:id rejects missing resolution", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(resolveRequest("any-flag", { status: "confirmed", },),);
    expect(res.status,).toBe(422,);
  });
});
