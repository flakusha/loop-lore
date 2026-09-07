// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for direct participant invites (POST /api/chats/:id/participants).
 *
 * Pins the trust-boundary contract that the invited `actorId` is resolved
 * against the SESSION user via `resolveActorAccess`, never trusted from the
 * client. Before the fix, a chat owner could add ANY actor id — including
 * another user's actor (no consent) or a nonexistent id (orphan row +
 * misaddressed notification). Cross-user joins belong to the invite-code
 * flow (`POST /api/invites/:code/join`), where the joiner consents.
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
  insertUsers,
} from "../../test-utils/insert-helpers";
import { participantRoutes, } from "./participants";

const OWNER_ID = randomUUID();
const INVITER_ID = randomUUID();
const CHAT_ID = randomUUID();

/** Build the participants route app with a fixed session identity injected. */
function makeApp(db: Kysely<DB>, userId: string,) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, }))
    .use(participantRoutes({ database: db, config, },),);
}

/**
 * Seed owner + inviter users/actors and an inviter-owned chat.
 * @param db
 */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(db, `inviter-${INVITER_ID}`, "Inviter", { id: INVITER_ID, } as never,);
  await insertActors(db, "Inviter", { id: INVITER_ID, user_id: INVITER_ID, owner_id: INVITER_ID, } as never,);

  await insertChats(db, "Party", INVITER_ID, {
    id: CHAT_ID,
    type: "group",
    mode: "group",
  } as never,);
}

describe("participantRoutes — invite ownership derived from session, not body", () => {
  test("invite rejects another user's actor even when the inviter owns the chat", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // Inviter owns the chat but names the owner's actor.
    const app = makeApp(db, INVITER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/participants`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ actorId: OWNER_ID, },),
      },),
    );

    expect(res.status,).toBe(403,);

    // No participant row may have been created by the rejected request.
    const rows = await db
      .selectFrom("chat_participants",)
      .select("actor_id",)
      .where("chat_id", "=", CHAT_ID,)
      .execute();
    expect(rows,).toHaveLength(0,);

    await db.destroy();
  });

  test("invite returns 404 for an unknown actor id", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, INVITER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/participants`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ actorId: randomUUID(), },),
      },),
    );

    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("invite succeeds for the inviter's own actor", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, INVITER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/participants`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ actorId: INVITER_ID, },),
      },),
    );

    expect(res.status,).toBe(201,);

    const rows = await db
      .selectFrom("chat_participants",)
      .select("actor_id",)
      .where("chat_id", "=", CHAT_ID,)
      .execute();
    expect(rows.map((r,) => r.actor_id),).toContain(INVITER_ID,);

    await db.destroy();
  });
});
