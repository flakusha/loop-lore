// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Owner-authority gap tests for the chats extras endpoints
 * (epic-chat-multi-ownership).
 *
 * The `isChatOwner` sweep changed three endpoints' 404-guard from
 * `chat.created_by === userId` to the owners set; no suite exercised them,
 * so the per-module coverage floor flags `extras.ts`. These tests pin the
 * authority contract per touched endpoint: owner-200 / outsider-404.
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
  insertChatParticipants,
  insertChats,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { extrasRoutes, } from "./extras";
import type { HandlerOpts, } from "./types";

const OWNER_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const CHAT_ID = randomUUID();
const WORLD_ID = randomUUID();
const LOCATION_ID = randomUUID();

/** Build the extras route app with a fixed session identity injected. */
function makeApp(db: Kysely<DB>, userId: string,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    // NOTE: `solo` holds "*" (admin bypass) — plain `user` lets the owners set decide.
    .derive(() => ({ userId, userRole: "user", }))
    .use(extrasRoutes({ database: db, config, } as unknown as HandlerOpts,),);
}

/**
 * Seed owner + outsider users/actors and an owner-created chat
 * bound to a world + location. `insertChats` seeds the creator's
 * `chat_owners` row (mirrors the production create path).
 */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(db, `out-${OUTSIDER_ID}`, "Outsider", { id: OUTSIDER_ID, } as never,);
  await insertActors(db, "Outsider", { id: OUTSIDER_ID, user_id: OUTSIDER_ID, owner_id: OUTSIDER_ID, } as never,);

  await insertWorlds(db, OWNER_ID, "World", { id: WORLD_ID, } as never,);
  await insertChats(db, "Party", OWNER_ID, {
    id: CHAT_ID,
    world_id: WORLD_ID,
  } as never,);

  await insertLocations(db, WORLD_ID, "Tavern", { id: LOCATION_ID, } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID,);
  await insertChatParticipants(db, CHAT_ID, OUTSIDER_ID,);
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

/** PUT helper for the persona endpoint. */
function putPersona(db: Kysely<DB>, asUserId: string, body: unknown,) {
  return makeApp(db, asUserId,).handle(
    new Request(`http://localhost/api/chats/${CHAT_ID}/persona`, {
      method: "PUT",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** PUT helper for the impersonate endpoint. */
function putImpersonate(db: Kysely<DB>, asUserId: string, body: unknown,) {
  return makeApp(db, asUserId,).handle(
    new Request(`http://localhost/api/chats/${CHAT_ID}/impersonate`, {
      method: "PUT",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

describe("extrasRoutes — owners-set authority (epic-chat-multi-ownership)", () => {
  test("PUT /location 200: owner clears the current location", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await putLocation(db, OWNER_ID, { locationId: null, },);
    expect(res.status,).toBe(200,);
    const json = (await res.json()) as { ok: boolean; current_location_id: null };
    expect(json.ok,).toBe(true,);
    expect(json.current_location_id,).toBeNull();

    await db.destroy();
  });

  test("PUT /location 404: non-owner participant without an owners row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await putLocation(db, OUTSIDER_ID, { locationId: null, },);
    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("PUT /persona 200: owner sets a persona on their participant row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await putPersona(db, OWNER_ID, { personaId: null, },);
    expect(res.status,).toBe(200,);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok,).toBe(true,);

    await db.destroy();
  });

  test("PUT /persona 404: non-owner participant without an owners row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await putPersona(db, OUTSIDER_ID, { personaId: null, },);
    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("PUT /impersonate 200: owner clears impersonation", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await putImpersonate(db, OWNER_ID, { impersonateActorId: null, },);
    expect(res.status,).toBe(200,);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok,).toBe(true,);

    await db.destroy();
  });

  test("PUT /impersonate 404: non-owner participant without an owners row", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await putImpersonate(db, OUTSIDER_ID, { impersonateActorId: null, },);
    expect(res.status,).toBe(404,);

    await db.destroy();
  });
});
