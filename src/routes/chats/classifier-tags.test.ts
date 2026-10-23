// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the per-chat classifier tag subset endpoints:
 *   GET /api/chats/:id/classifier-tags — vocabulary + active subset
 *   PUT /api/chats/:id/classifier-tags — persist the subset (membership in
 *   the curated vocabulary enforced server-side).
 *
 * Identity comes from the session (`requireUserId`); authority from
 * `checkChatSettingsAccess` (creator/owner/GM/admin pass, plain member and
 * stranger do not). The subset persists in system_config under
 * `classifier_tags_active:<chatId>`.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { getConfigValue, setConfig, } from "../../admin/config";
import { activeTagsKey, } from "../../aux-pipeline/class-tag-vocab";
import { CLASSIFIER_TAG_VOCABULARY_KEY, } from "../../aux-pipeline/class-template-resolver";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { classifierTagRoutes, } from "./classifier-tags";

const OWNER_ID = "u-owner";
const MEMBER_ID = "u-member";
const CHAT_ID = crypto.randomUUID();

/** Build the classifier-tag route app with a fixed session identity injected. */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null = "user",) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, userRole, }))
    .use(classifierTagRoutes({ database: db, config, },),);
}

/** Seed an owner-created chat with a plain member participant. */
async function seed(db: Kysely<DB>,): Promise<void> {
  for (const id of [OWNER_ID, MEMBER_ID,]) {
    await insertUsers(db, `name-${id}`, id, { id, } as never,);
    await insertActors(db, id, { id, user_id: id, owner_id: id, } as never,);
  }

  await insertChats(db, "Tagged", OWNER_ID, { id: CHAT_ID, } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: "owner", } as never,);
  await insertChatParticipants(db, CHAT_ID, MEMBER_ID, { role_in_chat: "member", } as never,);
}

/** Seed the curated vocabulary. */
async function seedVocabulary(db: Kysely<DB>, tags: string[],): Promise<void> {
  await setConfig(db, CLASSIFIER_TAG_VOCABULARY_KEY, JSON.stringify(tags,),);
}

/** GET the subset endpoints for the seeded chat. */
function get(app: ReturnType<typeof makeApp>,): Promise<Response> {
  return app.handle(new Request(`http://localhost/api/chats/${CHAT_ID}/classifier-tags`,),);
}

/** PUT a tags body through the route app. */
function put(app: ReturnType<typeof makeApp>, tags: string[],): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/api/chats/${CHAT_ID}/classifier-tags`, {
      method: "PUT",
      headers: { "content-type": "application/json", },
      body: JSON.stringify({ tags, },),
    },),
  );
}

describe("classifierTagRoutes — per-chat active subset", () => {
  test("GET is 401 for an anonymous caller", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await get(makeApp(db, null,),);
    expect(res.status,).toBe(401,);
  });

  test("GET is 403 for a plain member (settings gate)", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await get(makeApp(db, MEMBER_ID,),);
    expect(res.status,).toBe(403,);
  });

  test("GET returns the vocabulary and the persisted active subset for the owner", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await seedVocabulary(db, ["tavern", "dungeon", "heist",],);
    await setConfig(db, activeTagsKey(CHAT_ID,), JSON.stringify(["tavern",],),);

    const res = await get(makeApp(db, OWNER_ID,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { vocabulary: string[]; active: string[] };
    expect(body.vocabulary,).toEqual(["tavern", "dungeon", "heist",],);
    expect(body.active,).toEqual(["tavern",],);
  });

  test("GET returns empty lists when nothing is configured", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await get(makeApp(db, OWNER_ID,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { vocabulary: string[]; active: string[] };
    expect(body.vocabulary,).toEqual([],);
    expect(body.active,).toEqual([],);
  });

  test("PUT persists the active subset for the owner", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await seedVocabulary(db, ["tavern", "dungeon", "heist",],);

    const res = await put(makeApp(db, OWNER_ID,), ["tavern", "heist",],);
    expect(res.status,).toBe(200,);
    const stored = await getConfigValue(db, activeTagsKey(CHAT_ID,),);
    expect(JSON.parse(stored ?? "null",),).toEqual(["tavern", "heist",],);
  });

  test("PUT rejects tags outside the vocabulary with 400", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await seedVocabulary(db, ["tavern",],);

    const res = await put(makeApp(db, OWNER_ID,), ["tavern", "pirate-cove",],);
    expect(res.status,).toBe(400,);
    expect(await getConfigValue(db, activeTagsKey(CHAT_ID,),),).toBeUndefined();
  });

  test("PUT deduplicates the submitted subset", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await seedVocabulary(db, ["tavern", "dungeon",],);

    const res = await put(makeApp(db, OWNER_ID,), ["tavern", "tavern", "dungeon",],);
    expect(res.status,).toBe(200,);
    const stored = await getConfigValue(db, activeTagsKey(CHAT_ID,),);
    expect(JSON.parse(stored ?? "null",),).toEqual(["tavern", "dungeon",],);
  });

  test("PUT is 403 for a plain member and writes nothing", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await seedVocabulary(db, ["tavern",],);

    const res = await put(makeApp(db, MEMBER_ID,), ["tavern",],);
    expect(res.status,).toBe(403,);
    expect(await getConfigValue(db, activeTagsKey(CHAT_ID,),),).toBeUndefined();
  });

  test("PUT is 401 for an anonymous caller", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await put(makeApp(db, null,), ["tavern",],);
    expect(res.status,).toBe(401,);
  });
});
