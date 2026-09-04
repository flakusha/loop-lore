// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for party split / reunion (C7 Phase 3).
 *
 * Pins the trust-boundary contract that the split/reunite ownership check is
 * derived from the SESSION user, never a client-supplied `actorId`. Before the
 * fix, `POST /api/chats/:id/split` and `POST /api/chats/:id/reunite` accepted a
 * body `actorId` and used `body.actorId ?? userId` as the ownership identity —
 * a non-owner could submit the owner's id and pass the `created_by` guard.
 *
 * The service layer (`src/chat/service/split.ts`) already enforces ownership;
 * these tests exercise the real Elysia handler to prove the route no longer
 * leaks a client-controlled identity into that check.
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
import { partySplitRoutes, } from "./split";

const OWNER_ID = randomUUID();
const ATTACKER_ID = randomUUID();
const CHAT_ID = randomUUID();
const WORLD_ID = randomUUID();

/** Build the split/reunite route app with a fixed attacker identity injected. */
function makeApp(db: Kysely<DB>, userId: string,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, }))
    .use(partySplitRoutes({ database: db, config, },),);
}

/**
 * Seed owner + attacker users/actors, a world, locations, and an owner-owned chat.
 * @param db
 */
async function seed(db: Kysely<DB>,): Promise<void> {
  // Owner user + their actor (id === user id).
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  // Attacker user + actor (a distinct, non-owner identity).
  await insertUsers(db, `attacker-${ATTACKER_ID}`, "Attacker", { id: ATTACKER_ID, } as never,);
  await insertActors(db, "Attacker", { id: ATTACKER_ID, user_id: ATTACKER_ID, owner_id: ATTACKER_ID, } as never,);
  // System actor required by injectNarration (messages.actor_id FK).
  await insertActors(db, "System", { id: "system", } as never,);

  await insertWorlds(db, OWNER_ID, "Test World", { id: WORLD_ID, } as never,);
  await insertLocations(db, WORLD_ID, "Forest", { id: "forest", } as never,);
  await insertLocations(db, WORLD_ID, "Cave", { id: "cave", } as never,);

  // A chat owned by the owner.
  await insertChats(db, "Party", OWNER_ID, {
    id: CHAT_ID,
    type: "group",
    mode: "group",
  } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, {} as never,);
}

describe("partySplitRoutes — ownership derived from session, not body", () => {
  test("split rejects a non-owner even when body.actorId spoofs the owner", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // Attacker session, but body.actorId spoofs the chat owner.
    const app = makeApp(db, ATTACKER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/split`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          actorId: OWNER_ID,
          branches: [
            { locationId: "forest", actorIds: [ATTACKER_ID,], name: "A", },
            { locationId: "cave", actorIds: [OWNER_ID,], name: "B", },
          ],
        },),
      },),
    );

    expect(res.status,).toBe(403,);

    // No branch chat may have been created by the spoofed request.
    const branches = await db
      .selectFrom("chats",)
      .select("id",)
      .where("parent_chat_id", "=", CHAT_ID,)
      .execute();
    expect(branches,).toHaveLength(0,);

    await db.destroy();
  });

  test("reunite rejects a non-owner even when body.actorId spoofs the owner", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // Secondary chat also owned by the owner (so only the actorId spoof matters).
    const secondaryId = randomUUID();
    await insertChats(db, "Secondary", OWNER_ID, {
      id: secondaryId,
      type: "group",
      mode: "group",
    } as never,);

    const app = makeApp(db, ATTACKER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/reunite`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ secondaryChatId: secondaryId, actorId: OWNER_ID, },),
      },),
    );

    expect(res.status,).toBe(403,);

    await db.destroy();
  });

  test("split succeeds for the real owner without a body.actorId", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/split`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          branches: [
            { locationId: "forest", actorIds: [OWNER_ID,], name: "A", },
            { locationId: "cave", actorIds: [ATTACKER_ID,], name: "B", },
          ],
        },),
      },),
    );

    expect(res.status,).toBe(201,);

    const branches = await db
      .selectFrom("chats",)
      .select("id",)
      .where("parent_chat_id", "=", CHAT_ID,)
      .execute();
    expect(branches,).toHaveLength(2,);

    await db.destroy();
  });
});
