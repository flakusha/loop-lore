/**
 * Route tests for the content-rating override endpoints:
 *   PUT /api/nsfw/moderation/chat/:chatId
 *   PUT /api/nsfw/moderation/world/:worldId
 *
 * Both require `moderation.action` (granted to `moderator`) OR
 * `admin.system` (admin/solo/tester). GET /effective/:chatId is
 * unaffected — it uses `requireUserId` + `checkChatAccess` because any
 * chat participant can read the effective content rating.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { overridesRoutes, } from "./overrides";

/**
 * @param db
 * @param userId
 * @param role
 */
function createApp(db: Kysely<DB>, userId: string | null, role = "user",): Elysia {
  return new Elysia({ name: "test-overrides", },)
    .derive(() => ({ userId, userRole: role, }))
    .use(overridesRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param path
 * @param body
 */
function overrideRequest(path: string, body: Record<string, unknown>,): Request {
  return new Request(`http://localhost${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

describe("moderation override routes — moderator gating", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    // Service-level guard requires the target rows to exist (404 otherwise).
    await insertUsers(db, "creator-1", "Override Creator", { id: "creator-1" as never, },);
    await insertChats(db, "override-test-chat", "creator-1", { id: "c-1" as never, },);
    await insertWorlds(db, "creator-1", "override-test-world", { id: "w-1" as never, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  const chatBody = { override: "enabled" as const, };
  const worldBody = { override: "disabled" as const, };

  // ── PUT /api/nsfw/moderation/chat/:chatId ──────────────────

  test("PUT chat override requires auth", async () => {
    const app = createApp(db, null, "moderator",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/chat/c-1", chatBody,),);
    expect(res.status,).toBe(401,);
  });

  test("PUT chat override denies user role", async () => {
    const app = createApp(db, uid(), "user",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/chat/c-1", chatBody,),);
    expect(res.status,).toBe(403,);
  });

  test("PUT chat override denies viewer role", async () => {
    const app = createApp(db, uid(), "viewer",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/chat/c-1", chatBody,),);
    expect(res.status,).toBe(403,);
  });

  test("PUT chat override denies creator role", async () => {
    const app = createApp(db, uid(), "creator",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/chat/c-1", chatBody,),);
    expect(res.status,).toBe(403,);
  });

  test("PUT chat override accepts moderator role", async () => {
    // Moderators hold no admin.chat wildcard — they need chat access.
    const modId = "mod-route-1";
    await insertUsers(db, "mod-route-1", "Mod Route", { id: modId as never, },);
    await insertActors(db, "Mod Route Actor", { id: modId as never, user_id: modId as never, },);
    await insertChatParticipants(db, "c-1", modId,);
    const app = createApp(db, modId, "moderator",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/chat/c-1", chatBody,),);
    expect(res.status,).toBe(200,);
  });

  test("PUT chat override accepts admin role", async () => {
    const app = createApp(db, uid(), "admin",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/chat/c-1", chatBody,),);
    expect(res.status,).toBe(200,);
  });

  test("PUT chat override accepts solo role", async () => {
    const app = createApp(db, uid(), "solo",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/chat/c-1", chatBody,),);
    expect(res.status,).toBe(200,);
  });

  test("PUT chat override accepts tester role", async () => {
    const app = createApp(db, uid(), "tester",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/chat/c-1", chatBody,),);
    expect(res.status,).toBe(200,);
  });

  // ── PUT /api/nsfw/moderation/world/:worldId ────────────────

  test("PUT world override requires auth", async () => {
    const app = createApp(db, null, "moderator",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/world/w-1", worldBody,),);
    expect(res.status,).toBe(401,);
  });

  test("PUT world override denies user role", async () => {
    const app = createApp(db, uid(), "user",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/world/w-1", worldBody,),);
    expect(res.status,).toBe(403,);
  });

  test("PUT world override accepts moderator role", async () => {
    const app = createApp(db, uid(), "moderator",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/world/w-1", worldBody,),);
    expect(res.status,).toBe(200,);
  });

  test("PUT world override accepts admin role", async () => {
    const app = createApp(db, uid(), "admin",);
    const res = await app.handle(overrideRequest("/api/nsfw/moderation/world/w-1", worldBody,),);
    expect(res.status,).toBe(200,);
  });
});
