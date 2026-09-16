// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertAssetLinks,
  insertAssets,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { messageSearchRoutes, } from "./index";

function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null = "user",) {
  return new Elysia({ name: "test-message-search", },)
    .derive(() => ({ userId, userRole, }))
    .use(messageSearchRoutes({ database: db, },),);
}

interface SearchBody {
  results: {
    messageId: string;
    chatId: string;
    role: string;
    content: string;
    matchContext: string;
    attachments: unknown[];
    matchScore: number;
  }[];
  total: number;
  hasMore: boolean;
  query: string;
}

async function seedUser(db: Kysely<DB>,): Promise<string> {
  const userId = uid();
  await insertUsers(db, `u-${userId}`, "Test User", { id: userId, } as never,);
  // chat_participants.actor_id → actors; the user needs an actor row.
  await insertActors(db, "Test User Actor", {
    id: userId,
    actor_type: "user",
    user_id: userId,
    owner_id: userId,
  } as never,);
  return userId;
}

async function seedChat(db: Kysely<DB>, userId: string,): Promise<string> {
  const chatId = uid();
  await insertChats(db, "Chat", userId, { id: chatId, mode: "story", } as never,);
  await insertChatParticipants(db, chatId, userId, {},);
  return chatId;
}

async function seedMessage(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  content: string,
  opts: Parameters<typeof insertMessages>[5] = {},
): Promise<string> {
  const id = uid();
  await insertMessages(db, chatId, actorId, "user", content, {
    id,
    content_plaintext: content,
    ...opts,
  },);
  return id;
}

describe("messageSearchRoutes — GET /api/messages/search", () => {
  test("401 when no userId is derived", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/messages/search?q=x",),);
    expect(res.status,).toBe(401,);
    await db.destroy();
  });

  test("q returns the matching message with a snippet", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const chatId = await seedChat(db, userId,);
    const hit = await seedMessage(db, chatId, userId, "The dragon sleeps beneath Everhollow",);
    await seedMessage(db, chatId, userId, "Totally unrelated words here",);

    const app = makeApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/messages/search?q=dragon",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.results.map((r,) => r.messageId),).toEqual([hit,],);
    expect(body.total,).toBe(1,);
    expect(body.query,).toBe("dragon",);
    await db.destroy();
  });

  test("role filter restricts results", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const chatId = await seedChat(db, userId,);
    const asCharacter = uid();
    await insertMessages(db, chatId, userId, "character", "shared words", {
      id: asCharacter,
      content_plaintext: "shared words",
    },);
    await seedMessage(db, chatId, userId, "shared words",);

    const app = makeApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/messages/search?role=character",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.results.map((r,) => r.messageId),).toEqual([asCharacter,],);
    await db.destroy();
  });

  test("hasAttachment=true returns only messages with attachments", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const chatId = await seedChat(db, userId,);
    const assetId = uid();
    await insertAssets(db, userId, "pic.png", "image/png", "image", 10, "p", { id: assetId, },);
    const withAttachment = await seedMessage(db, chatId, userId, "look at this", {
      attachments: JSON.stringify([{ assetId, order: 0, caption: "", label: "message-attachment", },],),
    },);
    await seedMessage(db, chatId, userId, "just text",);
    await insertAssetLinks(db, assetId, "message", withAttachment,);

    const app = makeApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/messages/search?hasAttachment=true",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.results.map((r,) => r.messageId),).toEqual([withAttachment,],);
    await db.destroy();
  });

  test("attachmentType filters by the linked asset's type", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const chatId = await seedChat(db, userId,);
    const imageAsset = uid();
    const audioAsset = uid();
    await insertAssets(db, userId, "pic.png", "image/png", "image", 10, "p", { id: imageAsset, },);
    await insertAssets(db, userId, "song.mp3", "audio/mpeg", "audio", 10, "p", { id: audioAsset, },);
    const imageMsg = await seedMessage(db, chatId, userId, "an image", {
      attachments: JSON.stringify([{ assetId: imageAsset, order: 0, caption: "", label: "message-attachment", },],),
    },);
    const audioMsg = await seedMessage(db, chatId, userId, "a song", {
      attachments: JSON.stringify([{ assetId: audioAsset, order: 0, caption: "", label: "message-attachment", },],),
    },);
    await insertAssetLinks(db, imageAsset, "message", imageMsg,);
    await insertAssetLinks(db, audioAsset, "message", audioMsg,);

    const app = makeApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/messages/search?attachmentType=image",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.results.map((r,) => r.messageId),).toEqual([imageMsg,],);

    const res2 = await app.handle(new Request("http://localhost/api/messages/search?attachmentType=audio",),);
    const body2 = (await res2.json()) as SearchBody;
    expect(body2.results.map((r,) => r.messageId),).toEqual([audioMsg,],);
    await db.destroy();
  });

  test("linkPattern matches plaintext content literally", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const chatId = await seedChat(db, userId,);
    const linkMsg = await seedMessage(db, chatId, userId, "watch: https://youtube.com/watch?v=x_1",);
    await seedMessage(db, chatId, userId, "no links in here",);

    const app = makeApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/messages/search?linkPattern=youtube.com",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.results.map((r,) => r.messageId),).toEqual([linkMsg,],);

    // % and _ in the pattern must not act as wildcards.
    const res2 = await app.handle(new Request("http://localhost/api/messages/search?linkPattern=watch%3Fv%3Dx_1",),);
    const body2 = (await res2.json()) as SearchBody;
    expect(body2.results.map((r,) => r.messageId),).toEqual([linkMsg,],);
    const res3 = await app.handle(new Request("http://localhost/api/messages/search?linkPattern=watch%3Fv%3Dx%251",),);
    const body3 = (await res3.json()) as SearchBody;
    expect(body3.results,).toEqual([],);
    await db.destroy();
  });

  test("rejects invalid attachmentType with 4xx", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const app = makeApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/messages/search?attachmentType=executable",),);
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    await db.destroy();
  });

  test("chatId scope returns 404 for a chat the user cannot access", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const strangerId = await seedUser(db,);
    const foreignChat = await seedChat(db, strangerId,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/search?chatId=${foreignChat}`,),
    );
    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("hostile q/linkPattern input stays a literal search, never SQL", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const chatId = await seedChat(db, userId,);
    await seedMessage(db, chatId, userId, "harmless message text",);

    const app = makeApp(db, userId,);
    // FTS5 operator syntax, SQL comment/quote payloads — all must be treated
    // as search terms (bound MATCH parameter, quote-escaped tokens), return
    // 200, and leak nothing.
    for (const q of ['" OR 1=1 --', "ne AND (SELECT 1", "drag* -> other", 'x"y',]) {
      const res = await app.handle(
        new Request(`http://localhost/api/messages/search?q=${encodeURIComponent(q,)}`,),
      );
      expect(res.status,).toBe(200,);
      const body = (await res.json()) as SearchBody;
      expect(body.results.map((r,) => r.content),).not.toContain("harmless message text",);
    }
    // LIKE metacharacters in linkPattern must stay literal.
    const likeRes = await app.handle(
      new Request("http://localhost/api/messages/search?linkPattern=%25%25%27%3B%20DROP%20TABLE%20messages%3B--",),
    );
    expect(likeRes.status,).toBe(200,);
    expect(((await likeRes.json()) as SearchBody).results,).toEqual([],);
    // Table still intact after the hostile requests.
    const remaining = await db.selectFrom("messages",).selectAll().execute();
    expect(remaining.length,).toBe(1,);
    await db.destroy();
  });
});
