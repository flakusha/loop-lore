// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for /api/chats/:id/{archive,unarchive}
 * (TASK-chat-feature-archive-deletion-search).
 *
 * Translates ServiceResult -> HTTP. archiveChat/unarchiveChat return a
 * discriminated union: `{ code, message }` for errors, `{ ok, chatId }`
 * for success. The route maps `not_found` -> 404 and any other code
 * (forbidden) -> 403.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { archiveRoutes, } from "./archive-routes";

describe("chats archive-routes", () => {
  let db: Kysely<DB>;
  const OWNER_ID = crypto.randomUUID();
  const MEMBER_ID = crypto.randomUUID();
  const CHAT_ID = crypto.randomUUID();

  function makeApp(userId: string | undefined,) {
    return new Elysia({ name: "test-app", },)
      .derive(() => ({ userId, userRole: "user" as string | null, }))
      .use(archiveRoutes({ database: db, }, "/api",),);
  }

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_ID, } as never,);
    await insertUsers(db, "member", "Member", { id: MEMBER_ID, } as never,);
    await insertActors(db, "Owner", {
      id: OWNER_ID,
      user_id: OWNER_ID,
      owner_id: OWNER_ID,
    } as never,);
    await insertActors(db, "Member", {
      id: MEMBER_ID,
      user_id: MEMBER_ID,
      owner_id: MEMBER_ID,
    } as never,);
    await insertChats(db, "Archive Me", OWNER_ID, { id: CHAT_ID, } as never,);
    await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: "owner", },);
    await insertChatParticipants(db, CHAT_ID, MEMBER_ID, { role_in_chat: "member", },);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("POST /api/chats/:id/archive: owner archives successfully", async () => {
    const app = makeApp(OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/archive`, { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean; chatId: string };
    expect(body.ok,).toBe(true,);
    expect(body.chatId,).toBe(CHAT_ID,);
  });

  test("POST /api/chats/:id/archive: not_found -> 404 when chat id is unknown", async () => {
    const app = makeApp(OWNER_ID,);
    const missingChatId = crypto.randomUUID();
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${missingChatId}/archive`, { method: "POST", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST /api/chats/:id/archive: member (non-owner) -> 403 forbidden", async () => {
    const app = makeApp(MEMBER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/archive`, { method: "POST", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST /api/chats/:id/archive: missing user id surfaces a non-2xx response", async () => {
    const app = makeApp(undefined,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/archive`, { method: "POST", },),
    );
    // requireUserId short-circuits with a JSON error envelope.
    expect(res.status,).toBeGreaterThanOrEqual(400,);
  });

  test("POST /api/chats/:id/unarchive: owner unarchives successfully", async () => {
    // First archive the chat so unarchive has work to do.
    const archiveApp = makeApp(OWNER_ID,);
    const archiveRes = await archiveApp.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/archive`, { method: "POST", },),
    );
    expect(archiveRes.status,).toBe(200,);

    const unarchiveApp = makeApp(OWNER_ID,);
    const res = await unarchiveApp.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/unarchive`, { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { ok: boolean; chatId: string };
    expect(body.ok,).toBe(true,);
    expect(body.chatId,).toBe(CHAT_ID,);
  });

  test("POST /api/chats/:id/unarchive: not_found -> 404 when chat id is unknown", async () => {
    const app = makeApp(OWNER_ID,);
    const missingChatId = crypto.randomUUID();
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${missingChatId}/unarchive`, { method: "POST", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST /api/chats/:id/unarchive: member (non-owner) -> 403 forbidden", async () => {
    const app = makeApp(MEMBER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/unarchive`, { method: "POST", },),
    );
    expect(res.status,).toBe(403,);
  });
});
