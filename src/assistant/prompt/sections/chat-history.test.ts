/**
 * chatHistorySection integration test — content_encoding handling.
 *
 * Regression guard for BUG-gzip-stored-unencrypted-messages-reach-llm-prompt-and-export:
 *   - identity-encoded rows pass through verbatim
 *   - gzip-encoded rows (the 10KB+ compress path in `prepareContentStorage`)
 *     are base64-decoded + decompressed before reaching the prompt — never
 *     raw base64 soup
 *
 * Before the fix, only encrypted rows were unwrapped; gzip-encoded plaintext
 * leaked into the LLM prompt as opaque base64, inflating tokens ~1.3-4x and
 * (worse) feeding the model garbage that looked like chat history.
 */
import { describe, expect, test, } from "bun:test";
import type { Generated, Kysely, } from "kysely";
import { encodeContent, } from "../../../content/encode";
import type { ContentEncoding, } from "../../../content/types";
import {
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { chatHistorySection, } from "./chat-history";

async function setupContext(db: Kysely<DB>,): Promise<AssembleContext> {
  await insertUsers(db, "history-user", "History User",);
  const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
  await insertActors(db, "Speaker",);
  const actor = await db.selectFrom("actors",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
  await insertChats(db, "History Chat", user.id,);
  const chat = await db.selectFrom("chats",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

  return {
    db,
    actor: {
      id: actor.id,
      type: "character",
      display_name: "Speaker",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: null,
      agent_role: null,
    },
    chat: {
      id: chat.id,
      mode: "direct",
      world_id: null,
      current_location_id: null,
      output_style_preset: null,
      gm_config: null,
      response_length_preset: null,
      response_length_custom: null,
    },
    params: {
      actorId: actor.id,
      chatId: chat.id,
      modelId: "test-model",
    },
    isStory: false,
    tokenBudget: 4096,
  };
}

describe("chatHistorySection — content_encoding pass-through vs gzip decode", () => {
  test("identity rows pass through verbatim; gzip rows decode to plaintext", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }
    const { db, sqlite, } = await createTestDb();
    try {
      const ctx = await setupContext(db,);
      const actor = await db.selectFrom("actors",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
      const chat = await db.selectFrom("chats",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

      const identityBody = "short identity-encoded message.";
      // Build a payload large enough that compression will shrink it — the
      // encoder uses the same threshold as `prepareContentStorage` (10240).
      const longBody = "A".repeat(11_000,);
      const encoded = encodeContent(longBody, "gzip",);
      const identityEnc = "identity" as unknown as Generated<ContentEncoding>;
      const gzipEnc = encoded.encoding as unknown as Generated<ContentEncoding>;
      const confirmed = MessageStatus.Confirmed as unknown as Generated<MessageStatus>;
      const visible = MessageVisibility.Visible as unknown as Generated<MessageVisibility>;

      await insertMessages(db, chat.id, actor.id, MessageRole.User, identityBody, {
        content_encoding: identityEnc,
        status: confirmed,
        visibility: visible,
      },);
      await insertMessages(db, chat.id, actor.id, MessageRole.Assistant, encoded.encoded, {
        content_encoding: gzipEnc,
        status: confirmed,
        visibility: visible,
      },);

      const out = await chatHistorySection.build(ctx,);

      expect(out,).toHaveLength(2,);
      expect(out[0],).toEqual({ role: MessageRole.User, content: identityBody, },);
      // The gzip row MUST arrive as the decoded plaintext — never as the
      // raw base64 string the encoder stored.
      expect(out[1]?.content,).toBe(longBody,);
      expect(out[1]?.content.startsWith("AAAA",),).toBe(true,);
      // Sanity: the encoded base64 form is decidedly not 11k 'A's.
      expect(encoded.encoded.startsWith("AAAA",),).toBe(false,);
    } finally {
      sqlite.close();
    }
  });
});
