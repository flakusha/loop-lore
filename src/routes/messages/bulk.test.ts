// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bulk message actions: authorization stays per-message, cross-chat ids are
 * rejected, mixed selections report partial failure, and export reuses the
 * chat-export formatter + decrypt path.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertChats,
  insertChatSections,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { bulkRoutes, } from "./bulk";
import { authorizeMessageDelete, } from "./delete-authorization";

const config = {} as Config;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole = "user",): Elysia {
  return new Elysia({ name: "test-bulk", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(bulkRoutes({ database: db, config, },),) as unknown as Elysia;
}

/**
 * @param db
 * @param id
 * @param name
 */
async function seedUser(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertUsers(db, `user-${id}`, name, { id, } as never,);
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "user",
      display_name: name,
      user_id: id,
      owner_id: id,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

/**
 * @param db
 * @param chatId
 * @param actorId
 * @param content
 */
async function seedMessage(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  content: string,
): Promise<string> {
  return insertMessages(db, chatId, actorId, MessageRole.User, content, {
    status: MessageStatus.Confirmed,
    visibility: MessageVisibility.Visible,
  } as never,);
}

/**
 * @param app
 * @param path
 * @param body
 */
function post(app: Elysia, path: string, body: object,) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

interface BulkResult {
  ok: boolean;
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

describe("bulkRoutes", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  const outsider = uid();
  let chatA: string;
  let chatB: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedUser(db, owner, "Owner",);
    await seedUser(db, stranger, "Stranger",);
    await seedUser(db, outsider, "Outsider",);
    chatA = uid();
    chatB = uid();
    await insertChats(db, "Chat A", owner, { id: chatA, } as never,);
    await insertChats(db, "Chat B", owner, { id: chatB, } as never,);
    // Stranger is a participant — so a foreign message yields `forbidden`
    // (ownership denial) rather than a chat-access `not_found`.
    await db.insertInto("chat_participants",).values({
      chat_id: chatA,
      actor_id: stranger,
      role_in_chat: "member",
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("401 for anonymous callers on every bulk endpoint", async () => {
    const app = makeApp(db, null,);
    for (const action of ["delete", "section", "export",]) {
      const res = await post(app, `/api/chats/${chatA}/messages/bulk/${action}`, {
        ids: [uid(),],
        sectionId: null,
        format: "md",
      },);

      expect(res.status,).toBe(401,);
    }
  });

  test("404 for a caller with no access to the chat on every bulk endpoint", async () => {
    const app = makeApp(db, outsider,);
    const target = await seedMessage(db, chatA, owner, "private",);
    for (
      const [action, body,] of [
        ["delete", { ids: [target,], },],
        ["section", { ids: [target,], sectionId: null, },],
        ["export", { ids: [target,], format: "md", },],
      ] as const
    ) {
      const res = await post(app, `/api/chats/${chatA}/messages/bulk/${action}`, body,);
      expect(res.status,).toBe(404,);
    }
  });

  test("non-owner participant cannot bulk-assign sections", async () => {
    const target = await seedMessage(db, chatA, owner, "not mine",);
    const res = await post(makeApp(db, stranger,), `/api/chats/${chatA}/messages/bulk/section`, {
      ids: [target,],
      sectionId: null,
    },);

    // Mirrors the single-message assign route: owner/admin only.
    expect(res.status,).toBe(404,);
  });

  test("bulk delete reports mixed-selection partial failure", async () => {
    const mine = await seedMessage(db, chatA, owner, "mine",);
    const foreign = await seedMessage(db, chatA, stranger, "foreign",);
    const otherChat = await seedMessage(db, chatB, owner, "other chat",);
    const app = makeApp(db, owner,);

    const res = await post(app, `/api/chats/${chatA}/messages/bulk/delete`, {
      ids: [mine, foreign, otherChat,],
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as BulkResult;
    expect(body.ok,).toBe(true,);
    expect(body.succeeded,).toEqual([mine,],);
    expect(body.failed,).toContainEqual({ id: foreign, reason: "forbidden", },);
    expect(body.failed,).toContainEqual({ id: otherChat, reason: "not_found", },);

    const rows = await db.selectFrom("messages",).select(["id", "visibility",],)
      .where("id", "in", [mine, foreign, otherChat,],).execute();

    expect(rows.find((r,) => r.id === mine)?.visibility,).toBe("hidden_by_user",);
    expect(rows.find((r,) => r.id === foreign)?.visibility,).toBe("visible",);
    expect(rows.find((r,) => r.id === otherChat)?.visibility,).toBe("visible",);
  });

  test("bulk delete rejects a cross-chat id without touching it", async () => {
    const otherChat = await seedMessage(db, chatB, owner, "untouched",);
    const res = await post(makeApp(db, owner,), `/api/chats/${chatA}/messages/bulk/delete`, {
      ids: [otherChat,],
    },);

    expect(res.status,).toBe(200,);
    const body = await res.json() as BulkResult;
    expect(body.succeeded,).toEqual([],);
    expect(body.failed,).toEqual([{ id: otherChat, reason: "not_found", },],);
    const row = await db.selectFrom("messages",).select("visibility",)
      .where("id", "=", otherChat,).executeTakeFirst();

    expect(row?.visibility,).toBe("visible",);
  });

  test("bulk section reuses assign semantics: cross-chat and foreign section rejected", async () => {
    const app = makeApp(db, owner,);
    const section = await insertChatSections(db, chatA, "Act One",);
    const mine = await seedMessage(db, chatA, owner, "move me",);
    const otherChat = await seedMessage(db, chatB, owner, "stay put",);

    const ok = await post(app, `/api/chats/${chatA}/messages/bulk/section`, {
      ids: [mine, otherChat,],
      sectionId: section,
    },);

    expect(ok.status,).toBe(200,);
    const body = await ok.json() as BulkResult;
    expect(body.succeeded,).toEqual([mine,],);
    expect(body.failed,).toEqual([{ id: otherChat, reason: "not_found", },],);
    const moved = await db.selectFrom("messages",).select("section_id",)
      .where("id", "=", mine,).executeTakeFirst();

    expect(moved?.section_id,).toBe(section,);

    const foreign = await post(app, `/api/chats/${chatA}/messages/bulk/section`, {
      ids: [mine,],
      sectionId: uid(),
    },);

    expect(foreign.status,).toBe(404,);
  });

  test("bulk export formats only selected messages of this chat", async () => {
    const app = makeApp(db, owner,);
    const inChat = await seedMessage(db, chatA, owner, "unique-export-content",);
    const otherChat = await seedMessage(db, chatB, owner, "must-not-leak",);

    const md = await post(app, `/api/chats/${chatA}/messages/bulk/export`, {
      ids: [inChat, otherChat,],
      format: "md",
    },);

    expect(md.status,).toBe(200,);
    const mdText = await md.text();
    expect(mdText,).toContain("unique-export-content",);
    expect(mdText,).not.toContain("must-not-leak",);

    const json = await post(app, `/api/chats/${chatA}/messages/bulk/export`, {
      ids: [inChat, otherChat,],
      format: "json",
    },);

    expect(json.status,).toBe(200,);
    const payload = await json.json() as { messages: { id: string }[] };
    expect(payload.messages.map((m,) => m.id),).toEqual([inChat,],);
  });
});

describe("authorizeMessageDelete", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const member = uid();
  const outsider = uid();
  let chat: string;
  let ownMsg: string;
  let memberMsg: string;

  beforeAll(async () => {
    ({ db, } = await createTestDb());
    await seedUser(db, owner, "Owner",);
    await seedUser(db, member, "Member",);
    await seedUser(db, outsider, "Outsider",);
    chat = uid();
    await insertChats(db, "Chat", owner, { id: chat, } as never,);
    await db.insertInto("chat_participants",).values({
      chat_id: chat,
      actor_id: member,
      role_in_chat: "member",
    },).execute();

    ownMsg = await seedMessage(db, chat, owner, "hello",);
    memberMsg = await seedMessage(db, chat, member, "hi",);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("missing message collapses to not_found", async () => {
    const res = await authorizeMessageDelete(db, uid(), owner, "user",);
    expect(res,).toEqual({ ok: false, reason: "not_found", },);
  });

  test("caller without chat access sees not_found, not forbidden", async () => {
    const res = await authorizeMessageDelete(db, ownMsg, outsider, "user",);
    expect(res,).toEqual({ ok: false, reason: "not_found", },);
  });

  test("participant cannot delete another author's message", async () => {
    const res = await authorizeMessageDelete(db, ownMsg, member, "user",);
    expect(res,).toEqual({ ok: false, reason: "forbidden", },);
  });

  test("author can delete their own message", async () => {
    const res = await authorizeMessageDelete(db, memberMsg, member, "user",);
    expect(res,).toEqual({
      ok: true,
      message: { id: memberMsg, chat_id: chat, actor_id: member, },
    },);
  });

  test("chat admin can delete any participant message", async () => {
    const res = await authorizeMessageDelete(db, ownMsg, member, "admin",);
    expect(res.ok,).toBe(true,);
  });
});
