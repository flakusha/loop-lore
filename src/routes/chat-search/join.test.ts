// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { ChatParticipantRole, } from "../../db/enums";
import { WorldVisibility, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
  insertWorldMembers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { joinRoutes, } from "./join";

const mockConfig: Partial<Config> = {};

function makeApp(
  db: Kysely<DB>,
  userId: string | null,
  userRole: string | null = "user",
): Elysia {
  return new Elysia({ name: "test-join", },)
    .derive(() => ({ userId, userRole, }))
    .use(joinRoutes({ database: db, config: mockConfig as Config, },),);
}

interface JoinErrorBody {
  error: string;
  code: string;
}

interface JoinSuccessBody {
  chatId: string;
  joined: true;
  meta: unknown;
}

describe("joinRoutes — POST /api/chats/:id/join", () => {
  test("401 when no userId is derived", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${uid()}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(401,);
    await db.destroy();
  });

  test("rejects non-uuid chat id with 422", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = uid();
    await insertUsers(db, `u-${userId}`, "User", { id: userId, } as never,);
    await insertActors(db, "User Actor", { id: userId, actor_type: "user", } as never,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/not-a-uuid/join", { method: "POST", },),
    );
    expect(res.status,).toBeGreaterThanOrEqual(400,);
    await db.destroy();
  });

  test("400 when chat does not exist", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = uid();
    await insertUsers(db, `u-${userId}`, "User", { id: userId, } as never,);
    await insertActors(db, "User Actor", { id: userId, actor_type: "user", } as never,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${uid()}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as JoinErrorBody;
    expect(body.error,).toMatch(/not joinable/i,);

    await db.destroy();
  });

  test("400 when chat is not linked to a world", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = uid();
    const chatId = uid();
    await insertUsers(db, `u-${userId}`, "User", { id: userId, } as never,);
    await insertActors(db, "User Actor", { id: userId, actor_type: "user", } as never,);
    await insertChats(db, "Worldless", userId, { id: chatId, type: "group", mode: "story", } as never,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as JoinErrorBody;
    expect(body.error,).toMatch(/not joinable/i,);

    await db.destroy();
  });

  test("403 when world is private and user is not a member/owner/admin", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const ownerId = uid();
    const outsiderId = uid();
    const worldId = uid();
    const chatId = uid();
    await insertUsers(db, `u-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertUsers(db, `u-${outsiderId}`, "Outsider", { id: outsiderId, } as never,);
    await insertActors(db, "Owner Actor", { id: ownerId, actor_type: "user", } as never,);
    await insertActors(db, "Outsider Actor", { id: outsiderId, actor_type: "user", } as never,);
    await insertWorlds(db, ownerId, "Private", {
      id: worldId,
      visibility: WorldVisibility.Private,
    } as never,);
    await insertChats(db, "Secret", ownerId, {
      id: chatId,
      type: "group",
      mode: "story",
      world_id: worldId,
    } as never,);

    const app = makeApp(db, outsiderId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(403,);
    const body = (await res.json()) as JoinErrorBody;
    expect(body.error,).toMatch(/not a member/i,);

    await db.destroy();
  });

  test("allows joining when world is public (any authenticated user)", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const ownerId = uid();
    const userId = uid();
    const worldId = uid();
    const chatId = uid();
    await insertUsers(db, `u-${ownerId}`, "Owner", { id: ownerId, } as never,);
    await insertUsers(db, `u-${userId}`, "User", { id: userId, } as never,);
    await insertActors(db, "Owner Actor", { id: ownerId, actor_type: "user", } as never,);
    await insertActors(db, "User Actor", { id: userId, actor_type: "user", } as never,);
    await insertWorlds(db, ownerId, "Public World", {
      id: worldId,
      visibility: WorldVisibility.Public,
    } as never,);
    await insertChats(db, "Open Chat", ownerId, {
      id: chatId,
      type: "group",
      mode: "story",
      world_id: worldId,
    } as never,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as JoinSuccessBody;
    expect(body.chatId,).toBe(chatId,);
    expect(body.joined,).toBe(true,);

    // Verify a participant row was inserted with role=Member
    const participants = await db
      .selectFrom("chat_participants",)
      .select(["chat_id", "actor_id", "role_in_chat",],)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(participants,).toHaveLength(1,);
    expect(participants[0]!.actor_id,).toBe(userId,);
    expect(participants[0]!.role_in_chat,).toBe(ChatParticipantRole.Member,);

    await db.destroy();
  });

  test("allows joining when user is the world owner", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = uid();
    const worldId = uid();
    const chatId = uid();
    await insertUsers(db, `u-${userId}`, "Owner", { id: userId, } as never,);
    await insertActors(db, "Owner Actor", { id: userId, actor_type: "user", } as never,);
    await insertWorlds(db, userId, "My World", {
      id: worldId,
      visibility: WorldVisibility.Private,
    } as never,);
    await insertChats(db, "Mine", userId, {
      id: chatId,
      type: "group",
      mode: "story",
      world_id: worldId,
    } as never,);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(201,);
    await db.destroy();
  });

  test("allows joining when user has admin.chat permission (via role)", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const worldOwnerId = uid();
    const adminId = uid();
    const worldId = uid();
    const chatId = uid();
    await insertUsers(db, `u-${worldOwnerId}`, "World Owner", { id: worldOwnerId, } as never,);
    await insertUsers(db, `u-${adminId}`, "Admin", { id: adminId, } as never,);
    await insertActors(db, "Owner Actor", { id: worldOwnerId, actor_type: "user", } as never,);
    await insertActors(db, "Admin Actor", { id: adminId, actor_type: "user", } as never,);
    await insertWorlds(db, worldOwnerId, "Private", {
      id: worldId,
      visibility: WorldVisibility.Private,
    } as never,);
    await insertChats(db, "Owned", worldOwnerId, {
      id: chatId,
      type: "group",
      mode: "story",
      world_id: worldId,
    } as never,);

    // admin role grants admin.chat
    const app = makeApp(db, adminId, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(201,);
    await db.destroy();
  });

  test("allows joining when user is a non-owner world member", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const worldOwnerId = uid();
    const memberId = uid();
    const worldId = uid();
    const chatId = uid();
    await insertUsers(db, `u-${worldOwnerId}`, "World Owner", { id: worldOwnerId, } as never,);
    await insertUsers(db, `u-${memberId}`, "Member", { id: memberId, } as never,);
    await insertActors(db, "Owner Actor", { id: worldOwnerId, actor_type: "user", } as never,);
    await insertActors(db, "Member Actor", { id: memberId, actor_type: "user", } as never,);
    await insertWorlds(db, worldOwnerId, "Private", {
      id: worldId,
      visibility: WorldVisibility.Private,
    } as never,);
    await insertWorldMembers(db, worldId, memberId,);
    await insertChats(db, "Member Chat", worldOwnerId, {
      id: chatId,
      type: "group",
      mode: "story",
      world_id: worldId,
    } as never,);

    const app = makeApp(db, memberId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(201,);
    await db.destroy();
  });

  test("400 when user is already a participant", async () => {
    createLogger({ level: "error", },);
    const { db, } = await createTestDb();
    const userId = uid();
    const worldId = uid();
    const chatId = uid();
    await insertUsers(db, `u-${userId}`, "User", { id: userId, } as never,);
    await insertActors(db, "User Actor", { id: userId, actor_type: "user", } as never,);
    await insertWorlds(db, userId, "Public", {
      id: worldId,
      visibility: WorldVisibility.Public,
    } as never,);
    await insertChats(db, "Already In", userId, {
      id: chatId,
      type: "group",
      mode: "story",
      world_id: worldId,
    } as never,);
    await insertChatParticipants(db, chatId, userId, {
      role_in_chat: ChatParticipantRole.Owner,
    },);

    const app = makeApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/join`, { method: "POST", },),
    );
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as JoinErrorBody;
    expect(body.error,).toMatch(/already a participant/i,);

    await db.destroy();
  });
});
