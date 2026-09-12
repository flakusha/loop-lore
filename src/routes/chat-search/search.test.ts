// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
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
import { searchRoutes, } from "./search";

const mockConfig: Partial<Config> = {};

function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null = "user",) {
  return new Elysia({ name: "test-search", },)
    .derive(() => ({ userId, userRole, }))
    .use(searchRoutes({ database: db, config: mockConfig as Config, },),);
}

interface SearchRow {
  chatId: string;
  chatName: string;
  chatType: string;
  chatMode: string;
  lastMessageAt: string | null;
  characterName: string;
  characterAvatar: string | null;
  worldId: string | null;
}

interface SearchBody {
  data: SearchRow[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
  meta: unknown;
}

/**
 * Seed a user with a matching actor row (id = userId). The search route
 * joins on chat_participants.actor_id = userId, so the user must exist as
 * an actor for the INNER JOIN to find any chats.
 */
async function seedUser(db: Kysely<DB>,): Promise<string> {
  const userId = uid();
  await insertUsers(db, `u-${userId}`, "Test User", { id: userId, } as never,);
  await insertActors(db, "Test User Actor", {
    id: userId,
    actor_type: "user",
    user_id: userId,
    owner_id: userId,
  } as never,);
  return userId;
}

/**
 * Seed a chat that the search handler can find for `userId`.
 *
 * The route INNER JOINs on `chat_participants.actor_id = userId` AND
 * `actors.id = chat_participants.actor_id`. To match the search predicate
 * we seed a chat with `userId` as a participant and an extra character
 * participant so the JOIN finds at least one actor row.
 */
async function seedChat(
  db: Kysely<DB>,
  userId: string,
  opts: {
    name?: string;
    type?: "direct" | "group";
    mode?: string;
    worldId?: string | null;
    characterName?: string;
    /** Override `is_pinned` (defaults to "unpinned"). Pass "archived" for archived chats. */
    isPinned?: "unpinned" | "pinned" | "archived";
    /** Update timestamp so recency-tie tests can pin a deterministic order. */
    updatedAt?: string;
  } = {},
): Promise<string> {
  const chatId = uid();
  const characterId = uid();
  await insertChats(db, opts.name ?? "Chat", userId, {
    id: chatId,
    type: opts.type ?? "group",
    mode: opts.mode ?? "story",
    world_id: opts.worldId ?? null,
    is_pinned: opts.isPinned ?? "unpinned",
    updated_at: opts.updatedAt,
  } as never,);
  await insertChatParticipants(db, chatId, userId, {},);
  await insertActors(db, opts.characterName ?? "Bot Character", {
    id: characterId,
    actor_type: "character",
  } as never,);
  await insertChatParticipants(db, chatId, characterId, {},);
  return chatId;
}

describe("searchRoutes — GET /api/chats/search", () => {
  test("401 when no userId is derived", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group",),
    );
    expect(res.status,).toBe(401,);
    await db.destroy();
  });

  test("returns empty list for a user with no chats", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.data,).toEqual([],);
    expect(body.pagination.total,).toBe(0,);
    expect(body.pagination.pageSize,).toBe(20,);
    expect(body.pagination.page,).toBe(1,);

    await db.destroy();
  });

  test("returns chats where the user is a participant", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const chatId = await seedChat(db, userId, { name: "Adventure", },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.data.map((r,) => r.chatId),).toContain(chatId,);
    expect(body.pagination.total,).toBe(1,);

    await db.destroy();
  });

  test("type filter restricts to the given chat type", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const directChat = await seedChat(db, userId, { name: "DM", type: "direct", },);
    const groupChat = await seedChat(db, userId, { name: "Party", type: "group", },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    const ids = body.data.map((r,) => r.chatId);
    expect(ids,).toContain(groupChat,);
    expect(ids,).not.toContain(directChat,);

    await db.destroy();
  });

  test("world filter restricts to chats in the given world", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const worldA = uid();
    const worldB = uid();
    await insertWorlds(db, userId, "A", { id: worldA, } as never,);
    await insertWorlds(db, userId, "B", { id: worldB, } as never,);
    const chatA = await seedChat(db, userId, { name: "Chat A", worldId: worldA, },);
    const chatB = await seedChat(db, userId, { name: "Chat B", worldId: worldB, },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/search?type=group&world=${worldA}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    const ids = body.data.map((r,) => r.chatId);
    expect(ids,).toContain(chatA,);
    expect(ids,).not.toContain(chatB,);

    await db.destroy();
  });

  test("rejects invalid chat type with 4xx", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=invalid",),
    );
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    await db.destroy();
  });

  test("rejects world with non-uuid format", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group&world=not-a-uuid",),
    );
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    await db.destroy();
  });

  test("excludes chats where the user is not a participant", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    // Create another user with their own chat — search for userId should not see it
    const otherUserId = await seedUser(db,);
    await insertChats(db, "Other Chat", otherUserId, {
      type: "group",
      mode: "story",
    } as never,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.pagination.total,).toBe(0,);

    await db.destroy();
  });

  test("limit is reflected in pageSize", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    await seedChat(db, userId, { name: "Chat A", },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group&limit=5",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.pagination.pageSize,).toBe(5,);

    await db.destroy();
  });

  test("query.type filtering excludes chats of the wrong type even when name matches via search", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    // Two chats with same name, different types. type filter must isolate.
    const directChat = await seedChat(db, userId, { name: "Same", type: "direct", },);
    const groupChat = await seedChat(db, userId, { name: "Same", type: "group", },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=direct",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    const ids = body.data.map((r,) => r.chatId);
    expect(ids,).toContain(directChat,);
    expect(ids,).not.toContain(groupChat,);

    await db.destroy();
  });
});

describe("searchRoutes — include_archived + search_priority", () => {
  /**
   * @param db
   * @param userId
   * @param archivedName
   * @param liveName
   */
  async function seedLiveAndArchived(
    db: Kysely<DB>,
    userId: string,
    archivedName = "Old Archive",
    liveName = "New Live",
  ): Promise<{ archivedId: string; liveId: string }> {
    const archivedId = await seedChat(db, userId, {
      name: archivedName,
      isPinned: "archived",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },);
    const liveId = await seedChat(db, userId, {
      name: liveName,
      isPinned: "unpinned",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },);
    return { archivedId, liveId, };
  }

  test("default request excludes archived chats", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const { archivedId, liveId, } = await seedLiveAndArchived(db, userId,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    const ids = body.data.map((r,) => r.chatId);
    expect(ids,).toContain(liveId,);
    expect(ids,).not.toContain(archivedId,);

    await db.destroy();
  });

  test("includeArchived=true returns both live and archived chats", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const { archivedId, liveId, } = await seedLiveAndArchived(db, userId,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group&includeArchived=true",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    const ids = body.data.map((r,) => r.chatId);
    expect(ids,).toContain(archivedId,);
    expect(ids,).toContain(liveId,);

    await db.destroy();
  });

  test("live chats sort above archived chats at equal relevance (live_first default)", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const { archivedId, liveId, } = await seedLiveAndArchived(db, userId,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/search?type=group&includeArchived=true",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    const order = body.data.map((r,) => r.chatId);
    // Live-first means live < archived in the position array.
    expect(order.indexOf(liveId,),).toBeLessThan(order.indexOf(archivedId,),);

    await db.destroy();
  });

  test("search_priority=archive_first reverses the tier order", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const { archivedId, liveId, } = await seedLiveAndArchived(db, userId,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(
        "http://localhost/api/chats/search?type=group&includeArchived=true&searchPriority=archive_first",
      ),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    const order = body.data.map((r,) => r.chatId);
    expect(order.indexOf(archivedId,),).toBeLessThan(order.indexOf(liveId,),);

    await db.destroy();
  });

  test("search_priority without includeArchived degrades to live_first", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    // Only archived chat exists → excluded by default, so result is empty.
    await seedChat(db, userId, {
      name: "Archived Only",
      isPinned: "archived",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(
        "http://localhost/api/chats/search?type=group&searchPriority=archive_first",
      ),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as SearchBody;
    expect(body.data,).toEqual([],);

    await db.destroy();
  });

  test("rejects unknown search_priority with 4xx", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = await seedUser(db,);
    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(
        "http://localhost/api/chats/search?type=group&includeArchived=true&searchPriority=invalid",
      ),
    );
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    await db.destroy();
  });
});
