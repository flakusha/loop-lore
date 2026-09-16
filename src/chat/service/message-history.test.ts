// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { resubmitMessage, } from "./message-history";

let db: Kysely<DB>;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "owner" as never, },);
  await insertActors(db, "Owner Actor", { id: "owner" as never, actor_type: "user" as never, },);
  await insertChats(db, "Resubmit Chat", "owner", { id: "chat-resubmit" as never, },);
  await insertChats(db, "Other Chat", "owner", { id: "chat-other" as never, },);
  await insertMessages(db, "chat-resubmit", "owner", "user", "hello", { id: "msg-1" as never, },);
  await insertMessages(db, "chat-resubmit", "owner", "user", "world", { id: "msg-2" as never, parent_id: "msg-1", },);
  await insertMessages(db, "chat-other", "owner", "user", "other chat msg", { id: "msg-foreign" as never, },);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("resubmitMessage", () => {
  test("creates a new message with parent_id pointing at the source", async () => {
    const result = await resubmitMessage(db, {
      chatId: "chat-resubmit",
      messageId: "msg-1",
    },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.parentMessageId,).toBe("msg-1",);
    const row = await db
      .selectFrom("messages",)
      .select(["id", "chat_id", "parent_id", "actor_id", "status", "content",],)
      .where("id", "=", result.newMessageId,)
      .executeTakeFirst();
    expect(row,).not.toBeNull();
    expect(row?.chat_id,).toBe("chat-resubmit",);
    expect(row?.parent_id,).toBe("msg-1",);
    expect(row?.actor_id,).toBe("owner",);
    expect(row?.status,).toBe("sending",);
    expect(row?.content,).toBe("",);
  });

  test("branchFromId points the new row at the ancestor", async () => {
    const result = await resubmitMessage(db, {
      chatId: "chat-resubmit",
      messageId: "msg-2",
      branchFromId: "msg-1",
    },);
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.parentMessageId,).toBe("msg-1",);
    const row = await db
      .selectFrom("messages",)
      .select(["parent_id",],)
      .where("id", "=", result.newMessageId,)
      .executeTakeFirst();
    expect(row?.parent_id,).toBe("msg-1",);
  });

  test("rejects messageId absent in the chat", async () => {
    const result = await resubmitMessage(db, {
      chatId: "chat-resubmit",
      messageId: "msg-does-not-exist",
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.code,).toBe("not_found",);
  });

  test("rejects when messageId belongs to a different chat", async () => {
    const result = await resubmitMessage(db, {
      chatId: "chat-resubmit",
      messageId: "msg-foreign",
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.code,).toBe("cross_chat",);
  });

  test("rejects branchFromId that belongs to a different chat", async () => {
    const result = await resubmitMessage(db, {
      chatId: "chat-resubmit",
      messageId: "msg-1",
      branchFromId: "msg-foreign",
    },);
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.code,).toBe("cross_chat",);
  });
});