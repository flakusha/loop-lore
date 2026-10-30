// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the chat owners endpoints (epic-chat-multi-ownership).
 *
 * Contract:
 *   - GET /api/chats/:id/owners → 200 { chatId, owners } (sorted user ids,
 *     creator fallback included); 404 for unknown chats / no access.
 *   - POST /api/chats/:id/owners → 200 grant (owners after, autoInvited);
 *     403 non-owner non-admin; 404 chat/actor; 400 duplicate / cap;
 *     422 schema (missing actorId).
 *   - DELETE /api/chats/:id/owners/:userId → 200 remove (owners after);
 *     self-target = resign; 400 last-owner guard / not-an-owner.
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
import { ChatParticipantRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { chatOwnerRoutes, } from "./owners";

const OWNER_ID = randomUUID();
const PARTICIPANT_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const FOURTH_ID = randomUUID();
const ADMIN_ID = randomUUID();
const CHAT_ID = randomUUID();

/**
 * Build the route app with a fixed session identity injected.
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string, userRole: string = "user",) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, userRole, }))
    .use(chatOwnerRoutes({ database: db, config, },),);
}

/**
 * Seed owner + participant + outsider + fourth users/actors and an
 * owner-created chat (no chat_owners rows — exercises the creator fallback).
 * @param db
 */
async function seed(db: Kysely<DB>,): Promise<void> {
  await insertUsers(db, `owner-${OWNER_ID}`, "Owner", { id: OWNER_ID, } as never,);
  await insertActors(db, "Owner", { id: OWNER_ID, user_id: OWNER_ID, owner_id: OWNER_ID, } as never,);
  await insertUsers(db, `part-${PARTICIPANT_ID}`, "Participant", { id: PARTICIPANT_ID, } as never,);
  await insertActors(
    db,
    "Participant",
    { id: PARTICIPANT_ID, user_id: PARTICIPANT_ID, owner_id: PARTICIPANT_ID, } as never,
  );

  await insertUsers(db, `out-${OUTSIDER_ID}`, "Outsider", { id: OUTSIDER_ID, } as never,);
  await insertActors(db, "Outsider", { id: OUTSIDER_ID, user_id: OUTSIDER_ID, owner_id: OUTSIDER_ID, } as never,);
  await insertUsers(db, `fourth-${FOURTH_ID}`, "Fourth", { id: FOURTH_ID, } as never,);
  await insertActors(db, "Fourth", { id: FOURTH_ID, user_id: FOURTH_ID, owner_id: FOURTH_ID, } as never,);
  await insertUsers(db, `adm-${ADMIN_ID}`, "Admin", { id: ADMIN_ID, role: "admin", } as never,);
  await insertActors(db, "Admin", { id: ADMIN_ID, user_id: ADMIN_ID, owner_id: ADMIN_ID, } as never,);

  await insertChats(db, "Party", OWNER_ID, { id: CHAT_ID, } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: ChatParticipantRole.Owner, },);
  await insertChatParticipants(db, CHAT_ID, PARTICIPANT_ID, { role_in_chat: ChatParticipantRole.Member, },);
}

/** POST body helper. */
function postOwners(db: Kysely<DB>, asUserId: string, actorId: string,) {
  return makeApp(db, asUserId,).handle(
    new Request(`http://localhost/api/chats/${CHAT_ID}/owners`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify({ actorId, },),
    },),
  );
}

describe("chatOwnerRoutes — /api/chats/:id/owners", () => {
  test("GET 200: fresh chat exposes the creator via the fallback", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/owners`,),
    );

    expect(res.status,).toBe(200,);
    const json = (await res.json()) as { chatId: string; owners: string[] };
    expect(json.chatId,).toBe(CHAT_ID,);
    expect(json.owners,).toEqual([OWNER_ID,],);

    await db.destroy();
  });

  test("GET 404: unknown chat id", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${randomUUID()}/owners`,),
    );

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("POST 200: owner grants co-ownership to a participant", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postOwners(db, OWNER_ID, PARTICIPANT_ID,);

    expect(res.status,).toBe(200,);
    const json = (await res.json()) as {
      ok: boolean;
      userId: string;
      autoInvited: boolean;
      owners: string[];
    };

    expect(json.ok,).toBe(true,);
    expect(json.userId,).toBe(PARTICIPANT_ID,);
    expect(json.autoInvited,).toBe(false,);
    expect(json.owners,).toEqual([OWNER_ID, PARTICIPANT_ID,].sort(),);

    // Participant role flips to owner.
    const row = await db
      .selectFrom("chat_participants",)
      .select("role_in_chat",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", PARTICIPANT_ID,)
      .executeTakeFirstOrThrow();

    expect(row.role_in_chat,).toBe(ChatParticipantRole.Owner,);

    await db.destroy();
  });

  test("POST 200 with autoInvited=true: target is not a participant", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postOwners(db, OWNER_ID, OUTSIDER_ID,);

    expect(res.status,).toBe(200,);
    const json = (await res.json()) as { autoInvited: boolean; owners: string[] };
    expect(json.autoInvited,).toBe(true,);
    expect(json.owners,).toEqual([OWNER_ID, OUTSIDER_ID,].sort(),);

    await db.destroy();
  });

  test("POST 403: a non-owner member cannot grant ownership", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postOwners(db, PARTICIPANT_ID, OUTSIDER_ID,);

    expect(res.status,).toBe(403,);
    await db.destroy();
  });

  test("POST 404: unknown chat id", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${randomUUID()}/owners`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ actorId: PARTICIPANT_ID, },),
      },),
    );

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("POST 404: bogus target actor id", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await postOwners(db, OWNER_ID, randomUUID(),);

    expect(res.status,).toBe(404,);
    await db.destroy();
  });

  test("POST 400: duplicate grant (already an owner)", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    await postOwners(db, OWNER_ID, PARTICIPANT_ID,);
    const res = await postOwners(db, OWNER_ID, PARTICIPANT_ID,);

    expect(res.status,).toBe(400,);
    const json = (await res.json()) as { message?: string; error?: string };
    expect(JSON.stringify(json,),).toContain("already an owner",);

    await db.destroy();
  });

  test("POST 400: MAX_CHAT_OWNERS cap reached", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // Creator fallback + two grants = 3 (MAX_CHAT_OWNERS).
    expect((await postOwners(db, OWNER_ID, PARTICIPANT_ID,)).status,).toBe(200,);
    expect((await postOwners(db, OWNER_ID, OUTSIDER_ID,)).status,).toBe(200,);

    const res = await postOwners(db, OWNER_ID, FOURTH_ID,);
    expect(res.status,).toBe(400,);
    const json = (await res.json()) as Record<string, unknown>;
    expect(JSON.stringify(json,),).toContain("maximum",);

    await db.destroy();
  });

  test("POST 422: schema rejects a missing actorId", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/owners`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ reason: "no target", },),
      },),
    );

    expect(res.status,).toBe(422,);
    await db.destroy();
  });

  test("POST 200: admin authority bypasses the owner check", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, ADMIN_ID, "admin",).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/owners`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ actorId: PARTICIPANT_ID, },),
      },),
    );

    expect(res.status,).toBe(200,);
    await db.destroy();
  });

  test("DELETE 200: owner removes a co-owner; role demotes and list shrinks", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await postOwners(db, OWNER_ID, PARTICIPANT_ID,);

    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/owners/${PARTICIPANT_ID}?reason=cleanup`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(200,);
    const json = (await res.json()) as { ok: boolean; owners: string[] };
    expect(json.ok,).toBe(true,);
    expect(json.owners,).toEqual([OWNER_ID,],);

    const row = await db
      .selectFrom("chat_participants",)
      .select("role_in_chat",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", PARTICIPANT_ID,)
      .executeTakeFirstOrThrow();

    expect(row.role_in_chat,).toBe(ChatParticipantRole.Member,);

    await db.destroy();
  });

  test("DELETE 200: an owner may resign by targeting their own user id", async () => {
    const { db, } = await createTestDb();
    await seed(db,);
    await postOwners(db, OWNER_ID, PARTICIPANT_ID,);

    const res = await makeApp(db, PARTICIPANT_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/owners/${PARTICIPANT_ID}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(200,);
    const json = (await res.json()) as { owners: string[] };
    expect(json.owners,).toEqual([OWNER_ID,],);

    await db.destroy();
  });

  test("DELETE 400: last-owner guard on a fallback-only chat", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/owners/${OWNER_ID}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(400,);
    const json = (await res.json()) as Record<string, unknown>;
    expect(JSON.stringify(json,),).toContain("last remaining owner",);

    await db.destroy();
  });

  test("DELETE 400: target user is not an owner of the chat", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const res = await makeApp(db, OWNER_ID,).handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/owners/${OUTSIDER_ID}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(400,);
    const json = (await res.json()) as Record<string, unknown>;
    expect(JSON.stringify(json,),).toContain("not an owner",);

    await db.destroy();
  });
});
