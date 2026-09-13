// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { applyRewriteToMessage, } from "./rewrite-apply";

const testConfig = {
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
} as unknown as Config;

describe("applyRewriteToMessage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  let chatId: string;
  let otherChatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, `user-${owner}`, "Owner", { id: owner, } as never,);
    await insertUsers(db, `user-${stranger}`, "Stranger", { id: stranger, } as never,);
    for (const [id, name,] of [[owner, "Owner",], [stranger, "Stranger",],] as const) {
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
          format_version: 0,
          visibility: "private",
          import_spec: "{}",
        },)
        .execute();
    }
    chatId = uid();
    otherChatId = uid();
    await insertChats(db, "Rewrite Chat", owner, { id: chatId, } as never,);
    await insertChats(db, "Other Chat", owner, { id: otherChatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  async function seedAssistant(chat: string, author: string, content = "original text",): Promise<string> {
    const id = uid();
    await insertMessages(db, chat, author, MessageRole.Assistant, content, { id, } as never,);
    return id;
  }

  test("author rewrites their message", async () => {
    const id = await seedAssistant(chatId, owner,);
    const result = await applyRewriteToMessage(db, {
      messageId: id,
      chatId,
      userId: owner,
      userRole: null,
      content: "rewritten text",
      config: testConfig,
    },);
    expect(result.ok,).toBe(true,);
    const row = await db.selectFrom("messages",).select(["content", "edited_at",],).where("id", "=", id,)
      .executeTakeFirst();
    expect(row?.content,).toBe("rewritten text",);
    expect(row?.edited_at,).not.toBeNull();
  });

  test("missing message is not_found", async () => {
    const result = await applyRewriteToMessage(db, {
      messageId: uid(),
      chatId,
      userId: owner,
      userRole: null,
      content: "x",
      config: testConfig,
    },);
    expect(result,).toEqual({ ok: false, error: "not_found", },);
  });

  test("stranger is forbidden", async () => {
    const id = await seedAssistant(chatId, owner,);
    const result = await applyRewriteToMessage(db, {
      messageId: id,
      chatId,
      userId: stranger,
      userRole: null,
      content: "hijacked",
      config: testConfig,
    },);
    expect(result,).toEqual({ ok: false, error: "forbidden", },);
  });

  test("other-chat target is cross_chat", async () => {
    const id = await seedAssistant(otherChatId, owner,);
    const result = await applyRewriteToMessage(db, {
      messageId: id,
      chatId,
      userId: owner,
      userRole: null,
      content: "hijacked",
      config: testConfig,
    },);
    expect(result,).toEqual({ ok: false, error: "cross_chat", },);
  });
});
