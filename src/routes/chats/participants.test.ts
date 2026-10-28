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
import { afterAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { initSmk, } from "../../crypto/smk";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
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

// Reset the process-global SMK once the file is done: the rotation test below
// installs a real key, and a live SMK flips isEncryptionEnabled() for every
// suite that shares the bun process.
afterAll(async () => {
  await initSmk({ required: false, compressThreshold: 128, compressAlgorithm: "gzip", },);
},);

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

/**
 * BE-2 — the participant row must NOT be removed when the key rotation
 * fails. The old order deleted the row first and answered 500 after the
 * removal had already taken effect, so the removed member kept the live key
 * and the chat could not be rotated again.
 */
describe("participantRoutes — a failed key rotation keeps the participant", () => {
  test("the participant row survives a rotation failure", async () => {
    // A real SMK so the rotation fails on the business condition (no
    // remaining participants), not on a missing-key misconfiguration.
    await initSmk({
      required: false,
      serverEncryptionKey: "b".repeat(64,),
      compressThreshold: 128,
      compressAlgorithm: "gzip",
    },);

    const { db, } = await createTestDb();
    const owner = randomUUID();
    const leaver = randomUUID();
    const chatId = randomUUID();
    await insertUsers(db, `owner-${owner}`, "Owner", { id: owner, } as never,);
    await insertActors(db, "Owner", { id: owner, user_id: owner, owner_id: owner, } as never,);
    await insertActors(db, "Leaver", { id: leaver, } as never,);
    await insertChats(db, "Encrypted Chat", owner, {
      id: chatId,
      encryption_level: "standard",
    } as never,);

    // The leaver is the ONLY participant — the rotation has nobody left to
    // distribute a key to and must fail.
    await insertChatParticipants(db, chatId, leaver,);

    const app = makeApp(db, owner,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/participants/${leaver}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(500,);

    const rows = await db
      .selectFrom("chat_participants",)
      .select("actor_id",)
      .where("chat_id", "=", chatId,)
      .execute();

    expect(rows.map((r,) => r.actor_id),).toContain(leaver,);

    await db.destroy();
  });
});

/** The list, update and remove paths of the participants route. */
describe("participantRoutes — list, update and remove", () => {
  test("lists the participants of a chat the caller can access", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await insertChatParticipants(db, CHAT_ID, OWNER_ID,);

    const app = makeApp(db, INVITER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/participants`,),
    );

    expect(res.status,).toBe(200,);
    const rows = await res.json() as Array<{ actor_id: string; display_name: string }>;
    expect(rows.map((r,) => r.actor_id),).toContain(OWNER_ID,);
    expect(rows[0]?.display_name,).toBe("Owner",);

    await db.destroy();
  });

  test("updates a participant's talkativity", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await insertChatParticipants(db, CHAT_ID, OWNER_ID,);

    const app = makeApp(db, INVITER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/participants/${OWNER_ID}`, {
        method: "PUT",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ talkativity: 7, },),
      },),
    );

    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("chat_participants",)
      .select("talkativity",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", OWNER_ID,)
      .executeTakeFirst();

    expect(row?.talkativity,).toBe(7,);

    await db.destroy();
  });

  test("removes a participant from a chat that does not rotate keys", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await insertChatParticipants(db, CHAT_ID, OWNER_ID,);

    const app = makeApp(db, INVITER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/participants/${OWNER_ID}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(204,);
    const rows = await db
      .selectFrom("chat_participants",)
      .select("actor_id",)
      .where("chat_id", "=", CHAT_ID,)
      .execute();

    expect(rows.map((r,) => r.actor_id),).not.toContain(OWNER_ID,);

    await db.destroy();
  });
});
