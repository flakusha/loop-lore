// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Guest-tier read access for public chats: list / detail / messages.
 * Guests derive (userId null, role `guest`); public chats must be readable
 * and listable, private/unlisted must stay 404. Uses the /api/v1 surface so
 * one app covers chats + message routes.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { AsyncStore, } from "../../async/store";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { v1Routes, } from "../v1";

function stubAsyncStore(): AsyncStore {
  return { jobs: new Map(), } as unknown as AsyncStore;
}

function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  const t = (k: string,) => k;
  return new Elysia({ name: "test-guest-chat-visibility", },)
    .derive(() => ({ userId, userRole, sessionId: null, locale: "en", t, }))
    .use(v1Routes({ database: db, config: {} as never, asyncStore: stubAsyncStore(), },),) as unknown as Elysia;
}

const OWNER = uid();
const STRANGER = uid();
const PUBLIC_CHAT = uid();
const PRIVATE_CHAT = uid();
const UNLISTED_CHAT = uid();

describe("guest chat visibility (public reads)", () => {
  let db: Kysely<DB>;
  let publicMsg: string;
  let privateMsg: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    for (const id of [OWNER, STRANGER,]) {
      await insertUsers(db, id, id, { id: id as never, },);
      await insertActors(db, id, { id: id as never, user_id: id as never, owner_id: id as never, },);
    }

    await insertChats(db, "Public", OWNER, { id: PUBLIC_CHAT as never, visibility: "public", },);
    await insertChatParticipants(db, PUBLIC_CHAT, OWNER,);
    await insertChats(db, "Private", OWNER, { id: PRIVATE_CHAT as never, visibility: "private", },);
    await insertChatParticipants(db, PRIVATE_CHAT, OWNER,);
    await insertChats(db, "Unlisted", OWNER, { id: UNLISTED_CHAT as never, visibility: "unlisted", },);
    await insertChatParticipants(db, UNLISTED_CHAT, OWNER,);
    publicMsg = await insertMessages(db, PUBLIC_CHAT, OWNER, MessageRole.User, "pub", {} as never,);
    privateMsg = await insertMessages(db, PRIVATE_CHAT, OWNER, MessageRole.User, "priv", {} as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("guest lists only the public chat", async () => {
    const res = await makeApp(db, null, "guest",)
      .handle(new Request("http://localhost/api/v1/chats",),);

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { id: string }[] };
    const ids = body.data.map((c,) => c.id);
    expect(ids,).toContain(PUBLIC_CHAT,);
    expect(ids,).not.toContain(PRIVATE_CHAT,);
    expect(ids,).not.toContain(UNLISTED_CHAT,);
  });

  test("guest reads public detail, 404 on private/unlisted", async () => {
    const app = makeApp(db, null, "guest",);
    const pub = await app.handle(new Request(`http://localhost/api/v1/chats/${PUBLIC_CHAT}`,),);
    expect(pub.status,).toBe(200,);
    for (const id of [PRIVATE_CHAT, UNLISTED_CHAT,]) {
      const denied = await app.handle(new Request(`http://localhost/api/v1/chats/${id}`,),);
      expect(denied.status,).toBe(404,);
    }
  });

  test("guest lists public messages, 404 on private", async () => {
    const app = makeApp(db, null, "guest",);
    const pub = await app.handle(
      new Request(`http://localhost/api/v1/chats/${PUBLIC_CHAT}/messages`,),
    );

    expect(pub.status,).toBe(200,);
    const denied = await app.handle(
      new Request(`http://localhost/api/v1/chats/${PRIVATE_CHAT}/messages`,),
    );

    expect(denied.status,).toBe(404,);
  });

  test("guest reads single public message, 404 on private", async () => {
    const app = makeApp(db, null, "guest",);
    const pub = await app.handle(new Request(`http://localhost/api/v1/messages/${publicMsg}`,),);
    expect(pub.status,).toBe(200,);
    const denied = await app.handle(new Request(`http://localhost/api/v1/messages/${privateMsg}`,),);
    expect(denied.status,).toBe(404,);
  });

  test("authed stranger reads + lists public, not private", async () => {
    const app = makeApp(db, STRANGER, "user",);
    const detail = await app.handle(new Request(`http://localhost/api/v1/chats/${PUBLIC_CHAT}`,),);
    expect(detail.status,).toBe(200,);
    const list = await app.handle(new Request("http://localhost/api/v1/chats",),);
    expect(list.status,).toBe(200,);
    const ids = ((await list.json()) as { data: { id: string }[] }).data.map((c,) => c.id);
    expect(ids,).toContain(PUBLIC_CHAT,);
    expect(ids,).not.toContain(PRIVATE_CHAT,);
    const denied = await app.handle(new Request(`http://localhost/api/v1/chats/${PRIVATE_CHAT}`,),);
    expect(denied.status,).toBe(404,);
  });
});
