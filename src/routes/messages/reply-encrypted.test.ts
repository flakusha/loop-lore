// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Encrypted assistant-reply path: with the SMK loaded, maybeAutoReply
 * stores the rule-based assistant reply encrypted (key_id set, content
 * is ciphertext — not the plaintext prompt echo).
 *
 * Separate file from reply.test.ts so SMK setup/teardown stays local:
 * initSmk is process-global (see crypto/at-rest.integration.test.ts),
 * so this suite resets it in afterAll.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { initSmk, } from "../../crypto/smk";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { maybeAutoReply, } from "./reply";

const testConfig = {
  assistant: { enabled: true, },
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip" as const, },
  generation: {
    providers: { openaiCompatible: [], },
    defaultProvider: null,
  },
} as unknown as Config;

describe("maybeAutoReply — encrypted assistant reply", () => {
  let db: Kysely<DB>;
  let actorId: string;
  let chatId: string;
  let parentMessageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    await initSmk({
      serverEncryptionKey: "b".repeat(64,),
      required: false,
      compressThreshold: 1024,
      compressAlgorithm: "gzip",
    },);
    ({ db, } = await createTestDb());

    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    actorId = userId;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "Test Actor",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    chatId = uid();
    await insertChats(db, "Encrypted Chat", actorId, { id: chatId, encryption_level: "standard", } as never,);
    parentMessageId = uid();
    await insertMessages(db, chatId, actorId, MessageRole.User, "hello world", {
      id: parentMessageId,
      swipe_index: 0,
    } as never,);
  },);

  afterAll(async () => {
    await initSmk({
      required: false,
      compressThreshold: 1024,
      compressAlgorithm: "gzip",
    },);
    await db.destroy();
  },);

  test("stores the assistant reply encrypted with a key id", async () => {
    const result = await maybeAutoReply(
      db,
      testConfig,
      chatId,
      actorId,
      parentMessageId,
      "hello",
      new Request("http://localhost/",),
    );
    expect(result.replied,).toBe(true,);
    const rows = await db
      .selectFrom("messages",)
      .select(["content", "key_id",],)
      .where("chat_id", "=", chatId,)
      .where("role", "=", MessageRole.Assistant,)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.key_id,).not.toBeNull();
    // NOTE: ciphertext is random bytes — "hello" could theoretically appear
    // by chance (~1e-7 per run). If this flakes, drop the assertion; key_id
    // above already proves the encryption branch ran.
    expect(rows[0]?.content,).not.toContain("hello",);
  });
});
