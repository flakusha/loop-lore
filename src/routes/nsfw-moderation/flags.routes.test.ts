/**
 * Route tests for the content-flag endpoints.
 *
 * Covers the reporter-identity hardening: `reporterId` must come from the
 * authenticated session, never from the request body, so a caller cannot
 * flag content as another user.
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

function createApp(db: Kysely<DB>, userId: string | null, role = "user",): Elysia {
  return new Elysia({ name: "test-flags", },)
    .derive(() => ({ userId, userRole: role, }))
    .use(flagsRoutes({ database: db, },),) as unknown as Elysia;
}

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

  test("POST derives reporterId from the session, not the body", async () => {
    const sessionUser = uid();
    const app = createApp(db, sessionUser,);
    // Body cannot carry reporterId (schema rejects it); session user is used.
    const res = await app.handle(
      flagRequest({ contentType: "message", contentId: `m-${uid()}`, chatId: "chat-1", flagReason: "spam", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json();
    const flag = body.data;
    expect(flag.reporterId,).toBe(sessionUser,);
    expect(flag.contentType,).toBe("message",);
    expect(flag.flagReason,).toBe("spam",);
  });

  test("POST ignores a spoofed reporterId in the body — session user wins", async () => {
    const sessionUser = uid();
    const app = createApp(db, sessionUser,);
    const res = await app.handle(
      flagRequest({ reporterId: "victim-user", contentType: "message", contentId: "x", flagReason: "spam", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json();
    const flag = body.data;
    expect(flag.reporterId,).toBe(sessionUser,);
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
});
