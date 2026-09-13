// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { initSmk, isEncryptionEnabled, } from "../../crypto/smk";
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
    await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
    await db.destroy();
  },);

  async function seedAssistant(chat: string, author: string, content = "original text",): Promise<string> {
    const id = uid();
    await insertMessages(db, chat, author, MessageRole.Assistant, content, { id, } as never,);
    return id;
  }

  /** Minimal structurally-valid encrypted payload (12-byte nonce, base64 enc). */
  function fakePayload(keyId: string,): string {
    return JSON.stringify({
      enc: Buffer.from("ciphertext",).toString("base64",),
      nonce: Buffer.alloc(12,).toString("base64",),
      algo: "aes-256-gcm",
      key_id: keyId,
    },);
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

  test("pre-encrypted content passes through with its key id", async () => {
    const id = await seedAssistant(chatId, owner,);
    const payload = fakePayload("k9",);
    const result = await applyRewriteToMessage(db, {
      messageId: id,
      chatId,
      userId: owner,
      userRole: null,
      content: payload,
      config: testConfig,
    },);
    expect(result,).toEqual({ ok: true, content: payload, },);
    const row = await db.selectFrom("messages",).select(["content", "key_id", "content_plaintext",],)
      .where("id", "=", id,).executeTakeFirst();
    expect(row?.content,).toBe(payload,);
    expect(row?.key_id,).toBe("k9",);
    expect(row?.content_plaintext,).toBeNull();
  });

  test("plaintext encrypts through SMK when enabled", async () => {
    await initSmk({
      serverEncryptionKey: "c".repeat(64,),
      required: false,
      compressThreshold: 1024,
      compressAlgorithm: "gzip",
    },);
    expect(isEncryptionEnabled(),).toBe(true,);
    try {
      const encChatId = uid();
      await insertChats(db, "Encrypted Chat", owner, { id: encChatId, encryption_level: "standard", } as never,);
      const id = await seedAssistant(encChatId, owner,);
      const result = await applyRewriteToMessage(db, {
        messageId: id,
        chatId: encChatId,
        userId: owner,
        userRole: null,
        content: "rewritten secret",
        config: testConfig,
      },);
      expect(result.ok,).toBe(true,);
      if (!result.ok) { throw new Error("expected ok",); }
      expect(result.content,).not.toBe("rewritten secret",);
      const row = await db.selectFrom("messages",).select(["content", "key_id", "content_plaintext",],)
        .where("id", "=", id,).executeTakeFirst();
      expect(row?.key_id,).not.toBeNull();
      expect(row?.content_plaintext,).toBe("rewritten secret",); // plaintext shadow mirrors PATCH edit route
    } finally {
      await initSmk({ required: false, compressThreshold: 1024, compressAlgorithm: "gzip", },);
    }
  });
});
