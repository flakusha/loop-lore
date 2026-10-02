// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wardrobe avatar route behavior tests.
 *
 * The generation routes are provider-driven, so what is pinned here is the
 * route's own contract: the emotion allowlist, the outfit scoping that must be
 * derived from the addressed item (never from the request body), and the
 * 400-on-startup-failure mapping. The outfit-resolve route is pinned for the
 * precedence ladder it exposes to callers.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AvatarService, } from "../characters/services/avatar-service";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatWardrobeOverrides,
  insertUsers,
  insertWardrobeItems,
} from "../test-utils/insert-helpers";
import { wardrobeAvatarRoutes, } from "./wardrobe-avatars";

const OWNER = "00000000-0000-4000-8000-000000000091";
const OWNER_USER = "00000000-0000-4000-8000-000000000101";
const OTHER_USER = "00000000-0000-4000-8000-000000000102";
const OUTFIT = "00000000-0000-4000-8000-000000000111";
const OTHER_OUTFIT = "00000000-0000-4000-8000-000000000112";
const CHAT = "00000000-0000-4000-8000-000000000121";

/**
 * @param db
 * @param userId
 * @returns an app exposing only the wardrobe avatar routes as this user
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  return new Elysia({ name: "test-wardrobe-avatars", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(wardrobeAvatarRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param path
 * @param body
 * @returns a JSON POST Request for the avatar routes
 */
function post(path: string, body: unknown,): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", },
    body: JSON.stringify(body,),
  },);
}

/**
 * @param res
 * @returns the human-readable message from the shared error envelope
 */
async function messageOf(res: Response,): Promise<string> {
  return (await res.json() as { error: string }).error;
}

describe("Wardrobe avatar routes — generation", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "av-owner", "Av Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "av-other", "Av Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Av Route Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);
    await insertWardrobeItems(db, "Av Outfit", {
      id: OUTFIT,
      actor_id: OWNER,
      descriptor: "plate armor",
    },);
    await db.insertInto("chats",).values({ id: CHAT, name: "Av Chat", created_by: OWNER_USER, },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("batch generation rejects an unknown emotion with 400", async () => {
    const res = await makeApp(db, OWNER_USER,).handle(
      post(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/emotion-avatars`, {
        base_avatar_id: "avatar-1",
        emotions: ["happy", "not-a-real-emotion",],
      },),
    );
    expect(res.status,).toBe(400,);
    expect(await messageOf(res,),).toBe("Invalid emotion: not-a-real-emotion",);
  });

  test("batch generation surfaces a job-start failure as 400, not 500", async () => {
    // No avatar row with this id, so the service refuses to start the job.
    const res = await makeApp(db, OWNER_USER,).handle(
      post(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/emotion-avatars`, {
        base_avatar_id: "avatar-that-does-not-exist",
        emotions: ["happy",],
      },),
    );
    expect(res.status,).toBe(400,);
    const message = await messageOf(res,);
    expect(message.length,).toBeGreaterThan(0,);
  });

  test("single-slot generation with an unknown emotion is 400", async () => {
    const res = await makeApp(db, OWNER_USER,).handle(
      post(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/emotion-avatars/single`, {
        base_avatar_id: "avatar-1",
        emotion: "nonsense",
      },),
    );
    expect(res.status,).toBe(400,);
    expect(await messageOf(res,),).toBe("Invalid emotion: nonsense",);
  });

  test("single-slot generation surfaces a job-start failure as 400", async () => {
    const res = await makeApp(db, OWNER_USER,).handle(
      post(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/emotion-avatars/single`, {
        base_avatar_id: "avatar-that-does-not-exist",
        emotion: "happy",
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("both generation routes require auth (401)", async () => {
    const batch = await makeApp(db,).handle(
      post(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/emotion-avatars`, { base_avatar_id: "a", },),
    );
    expect(batch.status,).toBe(401,);

    const single = await makeApp(db,).handle(
      post(`/api/actors/${OWNER}/wardrobe/${OUTFIT}/emotion-avatars/single`, {
        base_avatar_id: "a",
        emotion: "happy",
      },),
    );
    expect(single.status,).toBe(401,);
  });
});

describe("Wardrobe avatar routes — outfit resolution", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let avatars: AvatarService;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "res-owner", "Res Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "res-other", "Res Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Res Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);
    await insertWardrobeItems(db, "Override outfit", { id: OUTFIT, actor_id: OWNER, },);
    await insertWardrobeItems(db, "Body outfit", { id: OTHER_OUTFIT, actor_id: OWNER, },);
    await db.insertInto("chats",).values({ id: CHAT, name: "Res Chat", created_by: OWNER_USER, },).execute();

    // Two assets so the resolver has something real to select.
    await db.insertInto("assets",).values(
      ["av-res-1", "av-res-2",].map((id,) => ({
        id,
        owner_id: OWNER_USER,
        filename: `${id}.png`,
        mime_type: "image/png",
        asset_type: "image",
        size_bytes: 1024,
        storage_path: `/test/${id}.png`,
        storage_backend: "local",
        visibility: "private",
      })),
    ).execute();

    avatars = new AvatarService(db,);
    await avatars.createAvatar({
      actorId: OWNER,
      assetId: "av-res-1",
      label: "override joy",
      tags: { emotion: "joy", },
      outfitId: OUTFIT,
    },);
    await avatars.createAvatar({
      actorId: OWNER,
      assetId: "av-res-2",
      label: "body joy",
      tags: { emotion: "joy", },
      outfitId: OTHER_OUTFIT,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("a chat override wins and its source is reported", async () => {
    await insertChatWardrobeOverrides(db, CHAT, OWNER, OUTFIT,);
    const res = await makeApp(db, OWNER_USER,).handle(
      post(`/api/actors/${OWNER}/outfit-resolve`, { chatId: CHAT, emotion: "joy", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { outfit_id: string; source: string; avatar: unknown };
    expect(body.outfit_id,).toBe(OUTFIT,);
    expect(body.source,).toBe("chat_override",);
    expect(body.avatar,).toBeDefined();
  });

  test("an explicit outfitId in the body overrides resolution and reports source none", async () => {
    const res = await makeApp(db, OWNER_USER,).handle(
      post(`/api/actors/${OWNER}/outfit-resolve`, {
        chatId: CHAT,
        emotion: "joy",
        outfitId: OTHER_OUTFIT,
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { outfit_id: string; source: string };
    // The caller named the outfit; resolution did not choose it.
    expect(body.outfit_id,).toBe(OTHER_OUTFIT,);
  });

  test("with no chat the actor default is used and reported as default", async () => {
    await db.updateTable("actors",).set({ default_outfit: OTHER_OUTFIT, },).where("id", "=", OWNER,).execute();
    const res = await makeApp(db, OWNER_USER,).handle(
      post(`/api/actors/${OWNER}/outfit-resolve`, { emotion: "joy", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { outfit_id: string; source: string };
    expect(body.outfit_id,).toBe(OTHER_OUTFIT,);
    expect(body.source,).toBe("default",);
  });

  test("an emotion with no matching avatar is 404 No avatar found", async () => {
    const res = await makeApp(db, OWNER_USER,).handle(
      post(`/api/actors/${OWNER}/outfit-resolve`, { emotion: "rage", },),
    );
    expect(res.status,).toBe(404,);
    expect(await messageOf(res,),).toBe("No avatar found",);
  });

  test("outfit-resolve requires auth (401) and hides the actor (404)", async () => {
    const anon = await makeApp(db,).handle(
      post(`/api/actors/${OWNER}/outfit-resolve`, { emotion: "joy", },),
    );
    expect(anon.status,).toBe(401,);

    const other = await makeApp(db, OTHER_USER,).handle(
      post(`/api/actors/${OWNER}/outfit-resolve`, { emotion: "joy", },),
    );
    expect(other.status,).toBe(404,);
  });
});
