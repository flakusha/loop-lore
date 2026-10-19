// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The chat message list is the render path for message avatars, so it must
 * carry the outfit-aware asset the header outfit switcher produces.
 *
 * TASK-chat-avatar-resolver-outfit-aware: the ladder was unreachable from the
 * render, so switching an outfit changed nothing on screen. These tests drive
 * the real route end to end — override row in, resolved asset out — and are the
 * failing-before evidence for that defect.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AvatarService, } from "../../characters/services/avatar-service";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { readRoutes, } from "./read";

const OWNER = "00000000-0000-4000-8000-0000000000c1";
const NPC = "00000000-0000-4000-8000-0000000000c2";
const CHAT = "00000000-0000-4000-8000-0000000000d1";
const CHAT_2 = "00000000-0000-4000-8000-0000000000d2";
const ARMOR = "outfit-armor";
/** A second outfit, used to prove a miss never borrows another outfit's art. */
const COURT = "outfit-court";

const testConfig = {} as unknown as Config;
let db: Kysely<DB>;
let sqlite: Database;
let avatars: AvatarService;

function makeApp(userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-outfit-avatar-read", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(readRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
}

/** Seed an asset row (actors.avatar_asset_id FKs to assets.id). */
async function seedAsset(id: string,): Promise<void> {
  await db.insertInto("assets",).values({
    id,
    owner_id: OWNER,
    filename: `${id}.png`,
    mime_type: "image/png",
    asset_type: "image",
    size_bytes: 1024,
    storage_path: `/test/${id}.png`,
    storage_backend: "local",
    visibility: "private",
  },).onConflict((oc,) => oc.column("id",).doNothing()).execute();
}

async function seedOutfit(id: string,): Promise<void> {
  const now = new Date().toISOString();
  await db.insertInto("wardrobe_items",).values({
    id,
    actor_id: NPC,
    world_id: null,
    name: id,
    descriptor: "",
    tags: "[]",
    sort_order: 0,
    created_at: now,
    updated_at: now,
  },).execute();
}

async function seedVariant(assetId: string, emotion: string, outfitId?: string,): Promise<void> {
  await seedAsset(assetId,);
  await avatars.createAvatar({ actorId: NPC, assetId, label: assetId, tags: { emotion, }, outfitId, },);
}

async function seedOverride(chatId: string, outfitId: string,): Promise<void> {
  const now = new Date().toISOString();
  await db.insertInto("chat_wardrobe_overrides",).values({
    id: `ov-${chatId}`,
    chat_id: chatId,
    actor_id: NPC,
    outfit_id: outfitId,
    created_at: now,
    updated_at: now,
  },).execute();
}

/** Read one message row back out of the list endpoint. */
async function listRow(messageId: string, chatId = CHAT,): Promise<Record<string, unknown> | undefined> {
  const res = await makeApp(OWNER, "user",).handle(new Request(`http://localhost/api/chats/${chatId}/messages`,),);
  expect(res.status,).toBe(200,);
  const body = await res.json() as { data: Record<string, unknown>[] };
  return body.data.find((row,) => row.id === messageId);
}

describe("GET /chats/:id/messages carries the outfit-aware avatar", () => {
  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    avatars = new AvatarService(db,);

    await insertUsers(db, "owner", "Owner", { id: OWNER as never, },);
    await seedAsset("asset-base",);
    await insertActors(db, "Hero", { id: NPC as never, owner_id: OWNER, avatar_asset_id: "asset-base", },);
    await insertActors(db, "Owner", { id: OWNER as never, owner_id: OWNER, actor_type: "user", },);
    await insertChats(db, "Outfit Chat", OWNER, { id: CHAT, } as never,);
    await insertChats(db, "Plain Chat", OWNER, { id: CHAT_2, } as never,);
    await seedOutfit(ARMOR,);
    await seedOutfit(COURT,);
  },);

  beforeEach(async () => {
    await db.deleteFrom("character_avatars",).execute();
    await db.deleteFrom("chat_wardrobe_overrides",).execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("the header outfit override reaches the rendered assistant message", async () => {
    await seedVariant("asset-base-happy", "happy",);
    await seedVariant("asset-armor-happy", "happy", ARMOR,);
    await seedOverride(CHAT, ARMOR,);
    const id = await insertMessages(db, CHAT, NPC, MessageRole.Assistant, "in armor", { emotion: "happy", },);

    const row = await listRow(id,);

    expect(row?.avatar_asset_id,).toBe("asset-armor-happy",);
  });

  test("a message with no wardrobe in play is untouched and still renders", async () => {
    await seedVariant("asset-base-happy", "happy",);
    const id = await insertMessages(db, CHAT_2, NPC, MessageRole.Assistant, "plain", { emotion: "happy", },);

    const row = await listRow(id, CHAT_2,);

    expect(row?.avatar_asset_id,).toBeUndefined();
    expect(row?.emotion,).toBe("happy",);
  });

  test("user messages carry no avatar asset", async () => {
    await seedVariant("asset-armor-happy", "happy", ARMOR,);
    await seedOverride(CHAT, ARMOR,);
    const id = await insertMessages(db, CHAT, OWNER, MessageRole.User, "hi", { emotion: "happy", },);

    const row = await listRow(id,);

    expect(row?.avatar_asset_id,).toBeUndefined();
  });

  test("an outfit with no variants degrades to the base portrait, never another outfit", async () => {
    await seedVariant("asset-base-happy", "happy",);
    await seedVariant("asset-armor-happy", "happy", ARMOR,);
    // The override names an outfit that carries no variants at all.
    await seedOverride(CHAT, COURT,);
    const id = await insertMessages(db, CHAT, NPC, MessageRole.Assistant, "ghost outfit", { emotion: "happy", },);

    const row = await listRow(id,);

    expect(row?.avatar_asset_id,).not.toBe("asset-armor-happy",);
    expect(row?.avatar_asset_id,).toBe("asset-base-happy",);
  });
});
