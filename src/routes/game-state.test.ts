// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for game-state routes — latest snapshot, history, auth, limits.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import type { GameState, } from "../game-state/analyze";
import { extractAndStore, } from "../game-state/service";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { gameStateRoutes, } from "./game-state";

function block(json: unknown,): string {
  return ["```game-state", JSON.stringify(json,), "```",].join("\n",);
}

function snapshot(entities: GameState["entities"],): Record<string, unknown> {
  return { grid: { width: 10, height: 10, }, entities, };
}

function entity(id: string, x: number, y: number,): GameState["entities"][number] {
  return { id, name: `entity-${id}`, kind: "npc", x, y, };
}

function createApp(
  db: Kysely<DB>,
  userId: string | null,
  userRole: string | null = "user",
): Elysia {
  return new Elysia({ name: "test-game-state", },)
    .derive(() => ({ userId, userRole, sessionId: null, }))
    .use(gameStateRoutes({ database: db, }, "/api",),) as unknown as Elysia;
}

/** Seed `count` game-state rows for the chat, moving the hero each time. */
async function seedStates(db: Kysely<DB>, chatId: string, count: number,): Promise<void> {
  for (let i = 0; i < count; i++) {
    const id = await extractAndStore({
      database: db,
      chatId,
      messageId: null,
      content: block(snapshot([entity("hero", i, i,),],),),
    },);
    if (id === null) { throw new Error(`seed row ${i} failed`,); }
  }
}

describe("gameStateRoutes", () => {
  let db: Kysely<DB>;
  const userId = uid();
  let chatId: string;
  let emptyChatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const testDb = await createTestDb();
    db = testDb.db;

    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Game State User",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    chatId = await insertChats(db, `chat-${crypto.randomUUID()}`, userId,);
    emptyChatId = await insertChats(db, `chat-empty-${crypto.randomUUID()}`, userId,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  it("GET /chats/:id/game-state returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${chatId}/game-state`,),);
    expect(res.status,).toBe(401,);
  });

  it("GET /chats/:id/game-state returns 404 for unknown chat", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${crypto.randomUUID()}/game-state`,),);
    expect(res.status,).toBe(404,);
  });

  it("GET /chats/:id/game-state returns 404 when chat has no state", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${emptyChatId}/game-state`,),);
    expect(res.status,).toBe(404,);
  });

  it("GET /chats/:id/game-state returns latest state with analysis", async () => {
    await seedStates(db, chatId, 2,);

    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${chatId}/game-state`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      data: { messageId: string | null; createdAt: string; state: GameState; analysis: unknown };
    };
    expect(body.data.state.grid,).toEqual({ width: 10, height: 10, },);
    expect(body.data.state.entities,).toEqual([entity("hero", 1, 1,),],);
    expect(body.data.analysis,).not.toBeNull();
    expect(body.data.createdAt,).toBeTypeOf("string",);
  });

  it("GET /chats/:id/game-states returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${chatId}/game-states`,),);
    expect(res.status,).toBe(401,);
  });

  it("GET /chats/:id/game-states returns 404 for unknown chat", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${crypto.randomUUID()}/game-states`,),);
    expect(res.status,).toBe(404,);
  });

  it("GET /chats/:id/game-states respects limit and orders descending", async () => {
    const chat = await insertChats(db, `chat-limit-${crypto.randomUUID()}`, userId,);
    await seedStates(db, chat, 5,);

    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${chat}/game-states?limit=3`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { id: string; messageId: string | null; createdAt: string }[] };
    expect(body.data,).toHaveLength(3,);
    const ids = new Set(body.data.map((row,) => row.id),);
    expect(ids.size,).toBe(3,);
    // Latest state (hero at x=4) must come first
    const latest = await app.handle(new Request(`http://localhost/api/chats/${chat}/game-state`,),);
    const latestBody = (await latest.json()) as { data: { state: GameState } };
    expect(latestBody.data.state.entities,).toEqual([entity("hero", 4, 4,),],);
  });

  it("GET /chats/:id/game-states defaults to limit 20", async () => {
    const chat = await insertChats(db, `chat-default-${crypto.randomUUID()}`, userId,);
    await seedStates(db, chat, 22,);

    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${chat}/game-states`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data,).toHaveLength(20,);
  });

  it("GET /chats/:id/game-states clamps limit=0 to 1 and accepts over-max", async () => {
    const chat = await insertChats(db, `chat-clamp-${crypto.randomUUID()}`, userId,);
    await seedStates(db, chat, 3,);

    const app = createApp(db, userId,);
    const low = await app.handle(new Request(`http://localhost/api/chats/${chat}/game-states?limit=0`,),);
    expect(low.status,).toBe(200,);
    const lowBody = (await low.json()) as { data: unknown[] };
    expect(lowBody.data,).toHaveLength(1,);

    const high = await app.handle(new Request(`http://localhost/api/chats/${chat}/game-states?limit=500`,),);
    expect(high.status,).toBe(200,);
    const highBody = (await high.json()) as { data: unknown[] };
    expect(highBody.data,).toHaveLength(3,);
  });
});
