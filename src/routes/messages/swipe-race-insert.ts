// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Retry-on-collision insert for `messages` rows that participate in the
 * `(chat_id, parent_id, swipe_index)` unique index (see reply.ts for the
 * parallel pattern).
 *
 * Two concurrent callers (or a retried POST) may both read the same
 * `MAX(swipe_index)` and race on INSERT. The unique index will reject the
 * second INSERT; this helper catches that error, increments `swipe_index`,
 * and retries up to `MAX_ATTEMPTS` (default 8). After exhaustion it throws
 * so the route can convert it into a 503 service_busy response rather than
 * a 500.
 *
 * Side effects (attachments, mentions, initiative) MUST run only after
 * this helper resolves successfully — otherwise a retry-exhausted insert
 * would leave orphaned attachment/mention rows that reference no message.
 *
 * Returned object:
 *   { id, swipeIndex }  — the inserted row's id and the swipe_index used.
 *
 *   null                — idempotency hit: an existing row already covers
 *                         this (chatId, idempotencyKey) tuple. The route
 *                         should respond with that existing id.
 *
 * Exported for unit testing (see swipe-race-insert.test.ts).
 */
import type { Kysely, } from "kysely";
import {
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
} from "../../db/enums";
import type { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";

export const MAX_INSERT_ATTEMPTS = 8;

/** */
export interface SwipeInsertInput {
  id: string;
  chatId: string;
  actorId: string;
  parentId: string | null;
  role?: string;
  storedContent: string;
  storedKeyId: string | null;
  /**
   * Plaintext version of `storedContent`, if known at insert time. Stored
   * alongside ciphertext in `messages.content_plaintext` so the FTS5 trigger
   * (see migration 068) can search across at-rest-encrypted chats. Null
   * for client-pre-encrypted payloads (we never saw the plaintext).
   */
  storedPlaintext?: string | null;
  contentType?: string;
  contentEncoding: ContentEncoding;
  idempotencyKey: string | null;
}

/** */
export interface SwipeInsertResult {
  id: string;
  swipeIndex: number | null;
}

/** */
export class SwipeInsertExhaustedError extends Error {
  /**
   * @param message
   */
  constructor(message = "swipe_index retry exhausted after 8 attempts",) {
    super(message,);
    this.name = "SwipeInsertExhaustedError";
  }
}

/**
 * Look up an existing row by (chat_id, idempotency_key). Returns the row's
 * id, or null if no row exists yet. Used by the create route to short-circuit
 * retried POSTs.
 * @param database
 * @param chatId
 * @param idempotencyKey
 */
export async function findByIdempotencyKey(
  database: Kysely<DB>,
  chatId: string,
  idempotencyKey: string,
): Promise<string | null> {
  if (!idempotencyKey) { return null; }
  const row = await database
    .selectFrom("messages",)
    .select(["id",],)
    .where("chat_id", "=", chatId,)
    .where("idempotency_key", "=", idempotencyKey,)
    .executeTakeFirst();
  return row?.id ?? null;
}

/**
 * Insert a user message with retry-on-swipe-collision. See file header for
 * semantics. The id, role, content, key_id, content_type, etc. are passed
 * via the input shape so this helper is testable without Elysia fixtures.
 * @param database
 * @param input
 */
export async function insertUserMessageWithRetry(
  database: Kysely<DB>,
  input: SwipeInsertInput,
): Promise<SwipeInsertResult> {
  let swipeIndex: number | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
    try {
      if (input.parentId) {
        const maxSwipe = await database
          .selectFrom("messages",)
          .select(database.fn.max("swipe_index",).as("max_idx",),)
          .where("chat_id", "=", input.chatId,)
          .where("parent_id", "=", input.parentId,)
          .executeTakeFirst();
        swipeIndex = (maxSwipe?.max_idx ?? 0) + 1;
      } else {
        swipeIndex = null;
      }
      await database
        .insertInto("messages",)
        .values({
          id: input.id,
          chat_id: input.chatId,
          actor_id: input.actorId,
          parent_id: input.parentId,
          role: (input.role ?? MessageRole.User) as MessageRole,
          content: input.storedContent,
          key_id: input.storedKeyId,
          content_plaintext: input.storedPlaintext ?? null,
          content_type: (input.contentType ?? MessageContentType.Text) as MessageContentType,
          content_format: MessageContentFormat.Markdown,
          content_encoding: input.contentEncoding,
          status: MessageStatus.Confirmed,
          visibility: "visible",
          idempotency_key: input.idempotencyKey,
          swipe_index: swipeIndex,
        },)
        .execute();
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError !== undefined) { throw new SwipeInsertExhaustedError(); }
  return { id: input.id, swipeIndex, };
}
