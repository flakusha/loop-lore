// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the joinable-chats discovery endpoint.
 *
 * The endpoint (`GET /api/chats/joinable`) returns world-linked chats the
 * user is NOT already a participant in, optionally filtered by world and
 * current location. Coverage here exercises:
 *   - 401 when no user is attached
 *   - Empty result when nothing matches
 *   - Excludes chats where the user is already a participant
 *   - World filter (matches only chats in that world)
 *   - Location filter (matches only chats at that location)
 *   - Combined world + location filters
 *   - limit / offset query parameters (defaults + custom)
 *
 * Note: response shape from `jsonPaginated` is
 *   `{ data, pagination: { total, page, pageSize, totalPages }, meta }`.
 *
 * FK / identity notes:
 *   - chat_participants.chat_id → chats.id
 *   - chat_participants.actor_id → actors.id
 *   - The handler queries chat_participants with `actor_id = userId`
 *     (the userId supplied by `requireUserId`). For the participation-
 *     exclusion branch to fire, the actor row for the requesting user
 *     must therefore share the same id as `userId`. We use that
 *     convention here.
 *   - The handler's INNER JOIN on chat_participants also means a chat
 *     with zero participants is invisible — every test chat gets at
 *     least one otherActor participant seeded via `seedChat`.
 */

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
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { joinableRoutes, } from "./joinable";

const mockConfig = {} as any;

interface JoinableBody {
  data: Array<{ chatId: string; chatName?: string; worldId?: string }>;
  pagination: { total: number; page: number; pageSize: number };
  meta: unknown;
}

function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-joinable", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(joinableRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

async function seedChat(
  db: Kysely<DB>,
  name: string,
  owner: string,
  worldId: string | null,
  otherActorId: string,
  opts: { currentLocationId?: string | null } = {},
): Promise<string> {
  const id = uid();
  await insertChats(db, name, owner, {
    id,
    world_id: worldId,
    current_location_id: opts.currentLocationId ?? null,
  },);
  // Seed at least one participant so the INNER JOIN keeps the chat visible.
  await insertChatParticipants(db, id, otherActorId,);
  return id;
}

describe("joinableRoutes", () => {
  let db: Kysely<DB>;
  let userId: string;
  let otherUserId: string;
  let worldA: string;
  let worldB: string;
  let locationA: string;
  let locationB: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    userId = uid();
    otherUserId = uid();
    await insertUsers(db, `u-${userId}`, "Test User A", { id: userId, },);
    await insertUsers(db, `u-${otherUserId}`, "Test User B", { id: otherUserId, },);

    // userId doubles as the requesting user's actor id — the handler's
    // NOT IN subquery joins on chat_participants.actor_id = userId.
    await insertActors(db, "User A Actor", {
      id: userId,
      user_id: userId,
      owner_id: userId,
      actor_type: "user",
    },);
    await insertActors(db, "User B Actor", {
      id: otherUserId,
      user_id: otherUserId,
      owner_id: otherUserId,
      actor_type: "user",
    },);

    worldA = uid();
    worldB = uid();
    await insertWorlds(db, otherUserId, "World A", { id: worldA, },);
    await insertWorlds(db, otherUserId, "World B", { id: worldB, },);

    locationA = uid();
    locationB = uid();
    await insertLocations(db, worldA, "Loc A", { id: locationA, },);
    await insertLocations(db, worldB, "Loc B", { id: locationB, },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns 401 when no user is attached to the request", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/joinable",),
    );
    expect(res.status,).toBe(401,);
  });

  test("returns an empty result when no joinable chats exist", async () => {
    await seedChat(db, "no-world-chat", otherUserId, null, otherUserId,);
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/joinable",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as JoinableBody;
    expect(body.data,).toEqual([],);
    expect(body.pagination.total,).toBe(0,);
  });

  test("returns world-linked chats where the user is NOT already a participant", async () => {
    const chatA = await seedChat(db, "Chat A", otherUserId, worldA, otherUserId,);
    const chatB = await seedChat(db, "Chat B", otherUserId, worldA, otherUserId,);
    // userId actor joins chatA → chatA must be excluded by NOT IN subquery.
    await insertChatParticipants(db, chatA, userId,);

    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/joinable",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as JoinableBody;
    const ids = body.data.map((c,) => c.chatId);
    expect(ids,).toContain(chatB,);
    expect(ids,).not.toContain(chatA,);
  });

  test("applies the world filter when supplied", async () => {
    const chatWorldA = await seedChat(db, "WorldA Chat", otherUserId, worldA, otherUserId,);
    const chatWorldB = await seedChat(db, "WorldB Chat", otherUserId, worldB, otherUserId,);

    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/joinable?world=${worldA}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as JoinableBody;
    const ids = body.data.map((r,) => r.chatId);
    expect(ids,).toContain(chatWorldA,);
    expect(ids,).not.toContain(chatWorldB,);
    for (const row of body.data) {
      expect(row.worldId,).toBe(worldA,);
    }
  });

  test("applies the location filter when supplied", async () => {
    const chatLocA = await seedChat(db, "LocA Chat", otherUserId, worldA, otherUserId, {
      currentLocationId: locationA,
    },);
    const chatLocB = await seedChat(db, "LocB Chat", otherUserId, worldB, otherUserId, {
      currentLocationId: locationB,
    },);

    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/joinable?location=${locationA}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as JoinableBody;
    const ids = body.data.map((r,) => r.chatId);
    expect(ids,).toContain(chatLocA,);
    expect(ids,).not.toContain(chatLocB,);
  });

  test("applies world + location filters together", async () => {
    const both = await seedChat(db, "Both", otherUserId, worldA, otherUserId, {
      currentLocationId: locationA,
    },);
    const rightWorld = await seedChat(db, "Right world wrong loc", otherUserId, worldA, otherUserId, {
      currentLocationId: locationB,
    },);
    const rightLoc = await seedChat(db, "Right loc wrong world", otherUserId, worldB, otherUserId, {
      currentLocationId: locationA,
    },);

    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/joinable?world=${worldA}&location=${locationA}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as JoinableBody;
    const ids = body.data.map((r,) => r.chatId);
    expect(ids,).toContain(both,);
    expect(ids,).not.toContain(rightWorld,);
    expect(ids,).not.toContain(rightLoc,);
  });

  test("respects custom limit and offset", async () => {
    for (let i = 0; i < 3; i++) {
      await seedChat(db, `Paged Chat ${i}`, otherUserId, worldA, otherUserId,);
    }

    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/joinable?world=${worldA}&limit=1&offset=0`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as JoinableBody;
    expect(body.data,).toHaveLength(1,);
    expect(body.pagination.pageSize,).toBe(1,);
    expect(body.pagination.page,).toBe(1,);
    expect(body.pagination.total,).toBeGreaterThanOrEqual(1,);
  });

  test("default limit is 20 when no limit is supplied", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/joinable",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as JoinableBody;
    expect(body.pagination.pageSize,).toBe(20,);
  });
});
