// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route contract for scheduled messages + reminders
 * (TASK-scheduled-messages-reminders): auth, chat-hiding denials, and the
 * author-only cancel rule.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertScheduledMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { scheduledRoutes, } from "./index";

/** @param db @param userId @param userRole */
function makeApp(db: Kysely<DB>, userId: string | null, userRole = "user",): Elysia {
  return new Elysia({ name: "test-scheduled", },)
    .derive(() => ({ userId, userRole, }))
    .use(scheduledRoutes({ database: db, },),) as unknown as Elysia;
}

describe("scheduledRoutes", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let strangerId: string;
  let chatId: string;
  let messageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = uid();
    await insertUsers(db, ownerId, "Owner", { id: ownerId as never, },);
    await insertActors(db, "Owner Actor", { id: ownerId as never, actor_type: "user" as never, },);

    strangerId = uid();
    await insertUsers(db, strangerId, "Stranger", { id: strangerId as never, },);
    await insertActors(db, "Stranger Actor", {
      id: strangerId as never,
      actor_type: "user" as never,
    },);

    chatId = uid();
    await insertChats(db, "Owned Chat", ownerId, { id: chatId as never, },);

    messageId = uid();
    await insertMessages(db, chatId, ownerId, "user", "ping", { id: messageId as never, },);
  },);

  /** @param minutes */
  function isoIn(minutes: number,): string {
    return new Date(Date.now() + minutes * 60_000,).toISOString();
  }

  test("unauthenticated create is rejected with 401", async () => {
    const res = await makeApp(db, null,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ body: "hi", sendAt: isoIn(30,), },),
      },),
    );

    expect(res.status,).toBe(401,);
  });

  test("the chat owner can park a message", async () => {
    const res = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ body: "see you then", sendAt: isoIn(30,), },),
      },),
    );

    expect(res.status,).toBe(201,);
    const body = await res.json() as { chatId: string; status: string };
    expect(body.chatId,).toBe(chatId,);
    expect(body.status,).toBe("pending",);
  });

  test("a non-participant gets the chat-hiding 404, not a 403", async () => {
    const res = await makeApp(db, strangerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ body: "intruding", sendAt: isoIn(30,), },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("list returns the chat's parked messages to a participant", async () => {
    const res = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`,),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as unknown[];
    expect(body.some((r,) => (r as { body: string }).body === "see you then"),).toBe(true,);
  });

  test("list denies a non-participant", async () => {
    const res = await makeApp(db, strangerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`,),
    );

    expect(res.status,).toBe(404,);
  });

  test("a non-author cannot cancel someone else's parked message", async () => {
    const created = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ body: "mine only", sendAt: isoIn(30,), },),
      },),
    );

    const { id, } = await created.json() as { id: string };

    // Owner is a participant; a second user is added as one so the failure
    // is specifically the author rule, not chat access.
    const otherId = uid();
    await insertUsers(db, otherId, "Other", { id: otherId as never, },);
    await insertActors(db, "Other Actor", { id: otherId as never, actor_type: "user" as never, },);
    await db
      .insertInto("chat_participants",)
      .values({
        chat_id: chatId,
        actor_id: otherId,
        role_in_chat: "member",
        joined_at: new Date().toISOString(),
      },)
      .execute();

    const res = await makeApp(db, otherId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled/${id}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(404,);

    const row = await db
      .selectFrom("scheduled_messages",)
      .select("status",)
      .where("id", "=", id,)
      .executeTakeFirst();

    expect(row?.status,).toBe("pending",);
  });

  test("the author can cancel their own parked message", async () => {
    const created = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ body: "withdraw me", sendAt: isoIn(30,), },),
      },),
    );

    const { id, } = await created.json() as { id: string };

    const res = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled/${id}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("scheduled_messages",)
      .select("status",)
      .where("id", "=", id,)
      .executeTakeFirst();

    expect(row?.status,).toBe("canceled",);
  });

  test("a parked row in another chat is a 404 and stays pending", async () => {
    // Cross-chat IDOR: ownerId authors a parked row in chat B while
    // belonging only to chat A. DELETE /chats/A/scheduled/<row in B> must
    // not find — let alone cancel — the row. ownerId authors the row on
    // purpose: the author check alone would pass, so only the chat binding
    // can deny this. The DB assertion matters as much as the status, since a
    // 404 with the row already canceled would be just as broken.
    const chatBId = uid();
    await insertChats(db, "Foreign Chat", strangerId, { id: chatBId as never, },);
    const foreignRowId = await insertScheduledMessages(
      db,
      chatBId,
      ownerId,
      "mine, but in a chat you cannot reach",
      isoIn(30,),
    );

    // Chat A is the shared describe's chat, which ownerId created and can
    // therefore access; the row lives in chat B, which ownerId is not in.
    const res = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled/${foreignRowId}`, {
        method: "DELETE",
      },),
    );

    expect(res.status,).toBe(404,);

    const row = await db
      .selectFrom("scheduled_messages",)
      .select("status",)
      .where("id", "=", foreignRowId,)
      .executeTakeFirst();

    expect(row?.status,).toBe("pending",);
  });

  test("an empty body is a 400 and parks nothing", async () => {
    const res = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ body: "   ", sendAt: isoIn(30,), },),
      },),
    );

    expect(res.status,).toBe(400,);
  });

  test("an unparseable sendAt is a 400", async () => {
    const res = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`, {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ body: "when?", sendAt: "not-a-date", },),
      },),
    );

    expect(res.status,).toBe(400,);
  });

  test("the owner can arm a reminder on a chat message", async () => {
    const res = await makeApp(db, ownerId,).handle(
      new Request("http://localhost/api/reminders", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId, remindAt: isoIn(45,), },),
      },),
    );

    expect(res.status,).toBe(201,);
  });

  test("a non-participant cannot arm a reminder on a chat's message", async () => {
    const res = await makeApp(db, strangerId,).handle(
      new Request("http://localhost/api/reminders", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId, remindAt: isoIn(45,), },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("a reminder on a missing message is a 404", async () => {
    const res = await makeApp(db, ownerId,).handle(
      new Request("http://localhost/api/reminders", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ messageId: "does-not-exist", remindAt: isoIn(45,), },),
      },),
    );

    expect(res.status,).toBe(404,);
  });

  test("the reminder list is scoped to the caller", async () => {
    const owner = await makeApp(db, ownerId,).handle(new Request("http://localhost/api/reminders",),);
    expect(owner.status,).toBe(200,);
    const ownerRows = await owner.json() as unknown[];
    expect(ownerRows.length,).toBe(1,);

    const stranger = await makeApp(db, strangerId,).handle(new Request("http://localhost/api/reminders",),);
    expect(stranger.status,).toBe(200,);
    expect((await stranger.json() as unknown[]).length,).toBe(0,);
  });

  test("the /api/v1 prefix serves the route the composer calls", async () => {
    // The Alpine actions call /api/v1/...; the unversioned mount alone would
    // 404 the whole UI. Mounted in chatsSurface alongside the /api mount.
    const app = new Elysia({ name: "test-scheduled-v1", },)
      .derive(() => ({ userId: ownerId, userRole: "user", }))
      .use(scheduledRoutes({ database: db, }, "/api/v1",),) as unknown as Elysia;

    const res = await app.handle(
      new Request(`http://localhost/api/v1/chats/${chatId}/scheduled`,),
    );

    expect(res.status,).toBe(200,);
    // Every parked row for this chat comes back — the same body the
    // unversioned mount returns, proving it is the same handler.
    const rows: unknown = await res.json();
    if (!Array.isArray(rows,)) {
      throw new Error(`expected an array, got: ${JSON.stringify(rows,)}`,);
    }

    expect(rows.length,).toBeGreaterThan(0,);
    for (const row of rows) {
      if (typeof row !== "object" || row === null || !("chatId" in row)) {
        throw new Error(`unexpected row shape: ${JSON.stringify(row,)}`,);
      }

      expect(row.chatId,).toBe(chatId,);
    }

    // Both mounts stay live: the versioned one for the Alpine actions, the
    // /api one for parity with every other chat-scoped plugin.
    const unversioned = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/chats/${chatId}/scheduled`,),
    );

    expect(unversioned.status,).toBe(200,);
  });

  test("cancelling a reminder is scoped to the caller", async () => {
    const list = await makeApp(db, ownerId,).handle(new Request("http://localhost/api/reminders",),);
    const { id, } = (await list.json() as { id: string }[])[0]!;

    // A different user cannot delete someone else's reminder.
    const denied = await makeApp(db, strangerId,).handle(
      new Request(`http://localhost/api/reminders/${id}`, { method: "DELETE", },),
    );

    expect(denied.status,).toBe(404,);

    const res = await makeApp(db, ownerId,).handle(
      new Request(`http://localhost/api/reminders/${id}`, { method: "DELETE", },),
    );

    expect(res.status,).toBe(200,);
    const after = await makeApp(db, ownerId,).handle(new Request("http://localhost/api/reminders",),);
    expect((await after.json() as unknown[]).length,).toBe(0,);
  });
});
