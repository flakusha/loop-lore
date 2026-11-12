// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { AssetType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssets,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { omniSearchRoutes, } from "./index";

const BASE = "http://localhost";

let db: Kysely<DB>;
let sqlite: Database;
let userId: string;
let chatId: string;

function app(user: string | null,): Elysia {
  return new Elysia({ name: "test-omni-search", },)
    .derive(() => ({ userId: user, userRole: "user", }))
    .use(omniSearchRoutes({ database: db, },),) as unknown as Elysia;
}

function get(route: Elysia, path: string,) {
  const handle = (route as unknown as { handle: (r: Request,) => Promise<Response> }).handle;
  return handle(new Request(`${BASE}${path}`,),);
}

interface OmniBody {
  query: string;
  chats: { chatId: string; chatName: string }[];
  messages: { messageId: string; chatId: string; snippet: string }[];
  assets: { assetId: string; filename: string; matchScore: number }[];
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, sqlite, } = await createTestDb());
  userId = uid();
  await insertUsers(db, `u-${userId}`, "Test User", { id: userId, } as never,);
  await insertActors(db, "Test User Actor", {
    id: userId,
    actor_type: "user",
    user_id: userId,
    owner_id: userId,
  } as never,);

  chatId = uid();
  await insertChats(db, "Tavern Tales", userId, { id: chatId, mode: "story", } as never,);
  await insertChatParticipants(db, chatId, userId, {},);
  await insertActors(db, "Barkeep", { id: uid(), actor_type: "character", } as never,);

  await insertMessages(db, chatId, userId, "user", "a round of tavern ale", {
    id: uid(),
    content_plaintext: "a round of tavern ale",
  },);

  await insertAssets(db, userId, "Tavern interior.png", "image/png", AssetType.Image, 1024, "/t.png", {
    visibility: "private",
  } as never,);
},);

afterAll(async () => {
  await db.destroy();
  sqlite.close();
},);

describe("omniSearchRoutes — GET /api/search", () => {
  test("fans one query out to chats + messages + assets", async () => {
    const res = await get(app(userId,), "/api/search?q=tavern",);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as OmniBody;
    expect(body.query,).toBe("tavern",);
    expect(body.chats.map((c,) => c.chatId),).toContain(chatId,);
    expect(body.messages.length,).toBeGreaterThan(0,);
    expect(body.assets.map((a,) => a.filename),).toContain("Tavern interior.png",);
  });

  test("401 when no userId is derived", async () => {
    const res = await get(app(null,), "/api/search?q=tavern",);
    expect(res.status,).toBe(401,);
  });

  test("stranger sees none of the owner's surfaces", async () => {
    const stranger = uid();
    await insertUsers(db, `u-${stranger}`, "Stranger", { id: stranger, } as never,);
    const res = await get(app(stranger,), "/api/search?q=tavern",);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as OmniBody;
    expect(body.chats,).toEqual([],);
    expect(body.messages,).toEqual([],);
    expect(body.assets.map((a,) => a.filename),).not.toContain("Tavern interior.png",);
  });
});
