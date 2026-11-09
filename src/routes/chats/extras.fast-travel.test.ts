// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fast-travel unlock gate tests for `PUT /api/chats/:id/location`
 * (epic-world-management-ui: fast travel unlock status).
 *
 * A destination with a `requires_discovery` inbound edge rejects travel
 * with 403 until one of the caller's actors latches `location_discovery`
 * for it; ungated destinations and the world owner travel freely.
 *
 * Parallel-safety: every test builds its own private DB via createTestDb()
 * and destroys it before returning; all ids are file-scoped random UUIDs, so
 * tests are order-independent and safe to run concurrently with other files.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertLocationDiscovery,
  insertLocationEdges,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { extrasRoutes, } from "./extras";
import type { HandlerOpts, } from "./types";

const OWNER_ID = randomUUID();
const PLAYER_ID = randomUUID();
const CHAT_ID = randomUUID();
const WORLD_ID = randomUUID();
const ORIGIN_ID = randomUUID();
const GATED_ID = randomUUID();
const OPEN_ID = randomUUID();

/** Build the extras route app with a fixed session identity injected. */
function makeApp(db: Kysely<DB>, userId: string,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    // NOTE: `solo` holds "*" (admin bypass) — plain `user` lets the gate decide.
    .derive(() => ({ userId, userRole: "user", }))
    .use(extrasRoutes({ database: db, config, } as unknown as HandlerOpts,),);
}

/**
 * Seed a world owned by OWNER with one gated and one open destination, plus
 * a chat owned by PLAYER bound to that world.
 */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(db, `player-${PLAYER_ID}`, "Player", { id: PLAYER_ID, } as never,);
  await insertActors(db, "Player", { id: PLAYER_ID, user_id: PLAYER_ID, owner_id: PLAYER_ID, } as never,);

  await insertWorlds(db, OWNER_ID, "World", { id: WORLD_ID, } as never,);
  await insertChats(db, "Party", PLAYER_ID, {
    id: CHAT_ID,
    world_id: WORLD_ID,
  } as never,);

  await insertLocations(db, WORLD_ID, "Origin", { id: ORIGIN_ID, } as never,);
  await insertLocations(db, WORLD_ID, "Gated", { id: GATED_ID, } as never,);
  await insertLocations(db, WORLD_ID, "Open", { id: OPEN_ID, } as never,);
  await insertLocationEdges(db, WORLD_ID, ORIGIN_ID, GATED_ID, {
    mode: "walk",
    requires_discovery: 1,
  },);
}

/** PUT helper for the location endpoint. */
function putLocation(db: Kysely<DB>, asUserId: string, body: unknown,) {
  return makeApp(db, asUserId,).handle(
    new Request(`http://localhost/api/chats/${CHAT_ID}/location`, {
      method: "PUT",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

describe("extrasRoutes — fast-travel unlock gate", () => {
  test("gated destination rejects with 403 and leaves the chat unmoved", async () => {
    const { db, } = await createTestDb();
    try {
      await seed(db,);

      const res = await putLocation(db, PLAYER_ID, { locationId: GATED_ID, },);
      expect(res.status,).toBe(403,);

      const chat = await db
        .selectFrom("chats",)
        .select("current_location_id",)
        .where("id", "=", CHAT_ID,)
        .executeTakeFirstOrThrow();

      expect(chat.current_location_id,).toBeNull();
    } finally {
      await db.destroy();
    }
  });

  test("latching discovery unlocks the destination", async () => {
    const { db, } = await createTestDb();
    try {
      await seed(db,);

      await insertLocationDiscovery(db, WORLD_ID, GATED_ID, PLAYER_ID, { discovered: 1, },);

      const res = await putLocation(db, PLAYER_ID, { locationId: GATED_ID, },);
      expect(res.status,).toBe(200,);
    } finally {
      await db.destroy();
    }
  });

  test("open destination without gated edges travels freely", async () => {
    const { db, } = await createTestDb();
    try {
      await seed(db,);

      const res = await putLocation(db, PLAYER_ID, { locationId: OPEN_ID, },);
      expect(res.status,).toBe(200,);
    } finally {
      await db.destroy();
    }
  });

  test("world owner bypasses the gate", async () => {
    const { db, } = await createTestDb();
    try {
      await seed(db,);
      await insertChats(db, "Owner Party", OWNER_ID, { world_id: WORLD_ID, } as never,);

      const ownerChat = await db
        .selectFrom("chats",)
        .select("id",)
        .where("created_by", "=", OWNER_ID,)
        .where("name", "=", "Owner Party",)
        .executeTakeFirstOrThrow();

      const res = await makeApp(db, OWNER_ID,).handle(
        new Request(`http://localhost/api/chats/${ownerChat.id}/location`, {
          method: "PUT",
          headers: { "content-type": "application/json", },
          body: JSON.stringify({ locationId: GATED_ID, },),
        },),
      );

      expect(res.status,).toBe(200,);
    } finally {
      await db.destroy();
    }
  });
});
