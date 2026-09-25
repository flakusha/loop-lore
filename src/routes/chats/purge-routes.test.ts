// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for DELETE /api/chats/:id/purge
 * (FEAT-chat-level-purge-route).
 *
 * The purge route delegates to hardDeleteChat which enforces the
 * settings-access guard before cascading. This file covers the three
 * outcomes the route must distinguish: 204 happy, 404 not_found, and
 * 403 forbidden for outsiders.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
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

describe("chats purge-route", () => {
  let db: Kysely<DB>;
  const OWNER_ID = crypto.randomUUID();
  const MEMBER_ID = crypto.randomUUID();
  const CHAT_ID = crypto.randomUUID();

  function makeApp(userId: string | undefined,) {
    const config = createConfigSchema().defaults as Config;
    return new Elysia({ name: "test-app", },)
      .derive(() => ({ userId, userRole: "user" as string | null, }))
      .use(archiveRoutes({ database: db, config, }, "/api",),);
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
    await insertChats(db, "Purge Me", OWNER_ID, { id: CHAT_ID, } as never,);
    await insertChatParticipants(db, CHAT_ID, OWNER_ID, { role_in_chat: "owner", },);
    await insertChatParticipants(db, CHAT_ID, MEMBER_ID, { role_in_chat: "member", },);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  test("DELETE /api/chats/:id/purge: owner purges successfully (204)", async () => {
    const app = makeApp(OWNER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/purge`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);
    expect(
      await db.selectFrom("chats",).select("id",).where("id", "=", CHAT_ID,).executeTakeFirst(),
    ).toBeUndefined();
  });

  test("DELETE /api/chats/:id/purge: not_found -> 404 when chat id is unknown", async () => {
    const app = makeApp(OWNER_ID,);
    const missingChatId = crypto.randomUUID();
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${missingChatId}/purge`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE /api/chats/:id/purge: member (non-owner) -> 403 forbidden", async () => {
    const app = makeApp(MEMBER_ID,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${CHAT_ID}/purge`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
    // Chat row is still present after a rejected purge.
    expect(
      await db.selectFrom("chats",).select("id",).where("id", "=", CHAT_ID,).executeTakeFirst(),
    ).not.toBeUndefined();
  });
});
