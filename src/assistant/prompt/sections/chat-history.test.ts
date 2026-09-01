/**
 * chatHistorySection integration test — content_encoding handling.
 *
 * Regression guard for BUG-gzip-stored-unencrypted-messages-reach-llm-prompt-and-export:
 *   - identity-encoded rows pass through verbatim
 *   - gzip-encoded rows (the 10KB+ compress path in `prepareContentStorage`)
 *     are base64-decoded + decompressed before reaching the prompt — never
 *     raw base64 soup
 *
 * Regression guard for BUG-chat-history-truncates-to-oldest-messages-drops-recent-turns:
 *   - chatHistorySection reads the most recent N rows (DESC + LIMIT) so long
 *     chats keep their newest turns instead of dropping them. Output is
 *     reversed so the LLM sees history chronologically.
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

/**
 * @param db
 */
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
      // Explicit, monotonically increasing created_at so the section's
      // "most-recent-first then reverse" ordering is deterministic.
      await insertMessages(db, chat.id, actor.id, MessageRole.User, identityBody, {
        content_encoding: identityEnc,
        status: confirmed,
        visibility: visible,
        created_at: "2025-01-01T00:00:00.000Z" as unknown as Generated<string>,
      },);
      await insertMessages(db, chat.id, actor.id, MessageRole.Assistant, encoded.encoded, {
        content_encoding: gzipEnc,
        status: confirmed,
        visibility: visible,
        created_at: "2025-01-01T00:00:01.000Z" as unknown as Generated<string>,
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

  test("long chats keep the most recent turns (DESC + LIMIT, then reverse)", async () => {
    // Regression guard for BUG-chat-history-truncates-to-oldest-messages-drops-recent-turns.
    // Previously chatHistorySection did ASC + LIMIT, which silently dropped
    // the newest turns when a chat had more rows than maxMessages. The fix
    // orders DESC + LIMIT and reverses so the LLM sees history chronologically.
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized.
    }
    const { db, sqlite, } = await createTestDb();
    try {
      const ctx = await setupContext(db,);
      // Tight budget so maxMessages = floor(40 / 4) = 10 — far less than
      // the 15 rows we seed, forcing the section to truncate.
      const ctxWithBudget: AssembleContext = { ...ctx, tokenBudget: 40, };
      const actor = await db.selectFrom("actors",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
      const chat = await db.selectFrom("chats",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

      const confirmed = MessageStatus.Confirmed as unknown as Generated<MessageStatus>;
      const visible = MessageVisibility.Visible as unknown as Generated<MessageVisibility>;

      // Seed 15 rows with strictly increasing timestamps so order is
      // unambiguous. Mark every 5th with a sentinel so we can detect which
      // rows survive the budget cut.
      for (let i = 0; i < 15; i++) {
        const role = i % 2 === 0 ? MessageRole.User : MessageRole.Assistant;
        const body = `turn-${i.toString().padStart(2, "0",)}`;
        await insertMessages(db, chat.id, actor.id, role, body, {
          status: confirmed,
          visibility: visible,
          created_at: `2025-01-01T00:00:${i.toString().padStart(2, "0",)}.000Z` as unknown as Generated<string>,
        },);
      }

      const out = await chatHistorySection.build(ctxWithBudget,);

      // maxMessages = 10 → keep the newest 10 turns: turn-05 .. turn-14,
      // rendered chronologically (ASC) after the in-section reverse.
      expect(out,).toHaveLength(10,);
      expect(out[0]?.content,).toBe("turn-05",);
      expect(out[9]?.content,).toBe("turn-14",);
      // The newest turn MUST survive — this is the bug's central failure.
      expect(out.some((m,) => m.content === "turn-14"),).toBe(true,);
      // The oldest seeded turns MUST have been dropped.
      expect(out.some((m,) => m.content === "turn-00"),).toBe(false,);
    } finally {
      sqlite.close();
    }
  });
});
