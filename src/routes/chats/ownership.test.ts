// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for POST /api/chats/:id/transfer-ownership.
 *
 * Pins the trust-boundary contract:
 *   - 200 happy path: owner transfers to a participant; `created_by` flips,
 *     previous owner demoted to member, new owner promoted to owner.
 *   - 200 with auto-invite: target user is not a participant; inserted as owner
 *     and ownership transferred in one transaction.
 *   - 403: a non-owner non-admin cannot transfer.
 *   - 404: unknown chat id.
 *   - 400: self-transfer rejected at the route layer (body shape).
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
import { ownershipRoutes, } from "./ownership";

const OWNER_ID = randomUUID();
const PARTICIPANT_ID = randomUUID();
const OUTSIDER_ID = randomUUID();
const ADMIN_ID = randomUUID();
const CHAT_ID = randomUUID();

/**
 * Build the route app with a fixed session identity injected.
 * `userRole` defaults to "user" so most tests cover the user path; pass
 * "admin" to exercise the role-based bypass.
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string, userRole: string = "user",) {
  const config = createConfigSchema().defaults as Config;
  return new Elysia()
    .derive(() => ({ userId, userRole, }))
    .use(ownershipRoutes({ database: db, config, },),);
}

/**
 * Seed owner + participant + outsider users/actors and an owner-created chat.
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
  await insertUsers(db, `adm-${ADMIN_ID}`, "Admin", { id: ADMIN_ID, role: "admin", } as never,);
  await insertActors(db, "Admin", { id: ADMIN_ID, user_id: ADMIN_ID, owner_id: ADMIN_ID, } as never,);

  await insertChats(db, "Party", OWNER_ID, { id: CHAT_ID, } as never,);
  await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: ChatParticipantRole.Owner, },);
  await insertChatParticipants(db, CHAT_ID, PARTICIPANT_ID, { role_in_chat: ChatParticipantRole.Member, },);
}

describe("ownershipRoutes — POST /api/chats/:id/transfer-ownership", () => {
  test("200: owner transfers to existing participant; created_by flips and roles swap", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/transfer-ownership`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ newOwnerId: PARTICIPANT_ID, reason: "stepping down", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const json = (await res.json()) as {
      ok: boolean;
      newOwnerId: string;
      previousOwnerId: string;
      autoInvited: boolean;
    };
    expect(json.ok,).toBe(true,);
    expect(json.previousOwnerId,).toBe(OWNER_ID,);
    expect(json.newOwnerId,).toBe(PARTICIPANT_ID,);
    expect(json.autoInvited,).toBe(false,);

    const chat = await db.selectFrom("chats",).select("created_by",).where("id", "=", CHAT_ID,).executeTakeFirst();
    expect(chat?.created_by,).toBe(PARTICIPANT_ID,);

    const rows = await db
      .selectFrom("chat_participants",)
      .select(["actor_id", "role_in_chat",],)
      .where("chat_id", "=", CHAT_ID,)
      .execute();
    const roleById = Object.fromEntries(rows.map((r,) => [r.actor_id, r.role_in_chat,]),);
    expect(roleById[PARTICIPANT_ID],).toBe(ChatParticipantRole.Owner,);
    expect(roleById[OWNER_ID],).toBe(ChatParticipantRole.Member,);

    await db.destroy();
  });

  test("200 with autoInvited=true: target is not a participant; inserted as owner", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/transfer-ownership`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ newOwnerId: OUTSIDER_ID, },),
      },),
    );

    expect(res.status,).toBe(200,);
    const json = (await res.json()) as { ok: boolean; autoInvited: boolean };
    expect(json.ok,).toBe(true,);
    expect(json.autoInvited,).toBe(true,);

    const row = await db
      .selectFrom("chat_participants",)
      .select("role_in_chat",)
      .where("chat_id", "=", CHAT_ID,)
      .where("actor_id", "=", OUTSIDER_ID,)
      .executeTakeFirst();
    expect(row?.role_in_chat,).toBe(ChatParticipantRole.Owner,);

    await db.destroy();
  });

  test("403: a non-owner non-admin cannot transfer", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, PARTICIPANT_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/transfer-ownership`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ newOwnerId: OWNER_ID, },),
      },),
    );

    expect(res.status,).toBe(403,);
    const chat = await db.selectFrom("chats",).select("created_by",).where("id", "=", CHAT_ID,).executeTakeFirst();
    expect(chat?.created_by,).toBe(OWNER_ID,);

    await db.destroy();
  });

  test("200 admin-bypass: admin can transfer even though they are not the chat owner", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // ADMIN_ID is neither the creator nor a participant of CHAT_ID. The
    // user-role path would 403; the admin path must succeed.
    const app = makeApp(db, ADMIN_ID, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/transfer-ownership`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ newOwnerId: PARTICIPANT_ID, reason: "compliance takeover", },),
      },),
    );

    expect(res.status,).toBe(200,);
    const json = (await res.json()) as {
      ok: boolean;
      previousOwnerId: string;
      newOwnerId: string;
      autoInvited: boolean;
    };
    expect(json.ok,).toBe(true,);
    expect(json.previousOwnerId,).toBe(OWNER_ID,);
    expect(json.newOwnerId,).toBe(PARTICIPANT_ID,);
    expect(json.autoInvited,).toBe(false,);

    const afterChat = await db.selectFrom("chats",).select("created_by",).where("id", "=", CHAT_ID,).executeTakeFirst();
    expect(afterChat?.created_by,).toBe(PARTICIPANT_ID,);

    await db.destroy();
  });

  test("403: an admin cannot transfer to themselves (self-guard runs before bypass)", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, ADMIN_ID, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/transfer-ownership`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ newOwnerId: ADMIN_ID, },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect((await res.json()) as { error: string },).toBeDefined();

    await db.destroy();
  });

  test("400: admin cannot transfer to the current owner (already-current-owner branch)", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    // ADMIN transfers to OWNER — `previousOwnerId === newOwnerId` (both OWNER),
    // exercising the explicit branch that the self-guard short-circuits.
    const app = makeApp(db, ADMIN_ID, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/transfer-ownership`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ newOwnerId: OWNER_ID, },),
      },),
    );

    expect(res.status,).toBe(400,);
    expect((await res.json()) as { error: string },).toBeDefined();

    await db.destroy();
  });

  test("404: unknown chat id returns 404", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${randomUUID()}/transfer-ownership`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ newOwnerId: PARTICIPANT_ID, },),
      },),
    );

    expect(res.status,).toBe(404,);

    await db.destroy();
  });

  test("400: self-transfer rejected", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/transfer-ownership`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ newOwnerId: OWNER_ID, },),
      },),
    );

    expect(res.status,).toBe(400,);

    await db.destroy();
  });

  test("422: missing newOwnerId in body (Elysia schema rejection)", async () => {
    const { db, } = await createTestDb();
    await seed(db,);

    const app = makeApp(db, OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/transfer-ownership`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ reason: "oops", },),
      },),
    );

    // Elysia returns 422 for schema validation failures; the route never
    // enters the service so this is the canonical "bad body" code.
    expect(res.status,).toBe(422,);

    await db.destroy();
  });
});
