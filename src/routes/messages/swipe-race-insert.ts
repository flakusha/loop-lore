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
 *   { id, swipeIndex }              — the inserted row's id and the
 *                                     swipe_index used.
 *   { id, swipeIndex, replayedId }  — a concurrent writer with the same
 *                                     (chatId, idempotencyKey) won the
 *                                     insert race; `replayedId` is the
 *                                     existing row's id (dedup is now
 *                                     DB-enforced, migration 045) and the
 *                                     route must respond with it.
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
import { retryBounded, } from "../../utils/swipe-retry";

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
  /** Set when this call lost the insert race to an existing row that already
   *  covers the (chatId, idempotencyKey) tuple; the winner's row id. */
  replayedId?: string;
}

/**
 * Detect whether an insert error is the idempotency dedup unique violation
 * (migration 045, `uq_messages_idempotency_enforced` on
 * `(chat_id, idempotency_key) WHERE idempotency_key IS NOT NULL ...`). The
 * race loser must REPLAY the winner's row, never retry the same INSERT and
 * never bubble up as a 500.
 *
 * Matches both the bun:sqlite text form (`UNIQUE constraint failed:
 * messages.chat_id, messages.idempotency_key` — composite columns are each
 * table-prefixed, so the match keys on `messages.idempotency_key` appearing
 * anywhere after the failure prefix) and the error-code form
 * (`SQLITE_CONSTRAINT_UNIQUE: uq_messages_idempotency_enforced`) so a driver
 * message change cannot silently drop the replay mapping. Scoped to the
 * enforced index name / key column pair so unrelated unique violations
 * (swipe_index, PK) still take the swipe-retry or error path.
 * @param err
 * @returns {boolean}
 */
export function isIdempotencyUniqueViolation(err: unknown,): boolean {
  if (!(err instanceof Error)) { return false; }
  const msg = err.message;
  return /SQLITE_CONSTRAINT(?:_UNIQUE)?\b.*uq_messages_idempotency_enforced/i.test(msg,) ||
    /UNIQUE constraint failed:[\s\S]*messages\.idempotency_key\b/i.test(msg,);
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
 * @returns {Promise<string | null>}
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
 * A lost idempotency race replays the winner's row via `replayedId`.
 * @param database
 * @param input
 * @throws {Error}
 * @returns {Promise<SwipeInsertResult>}
 */
export async function insertUserMessageWithRetry(
  database: Kysely<DB>,
  input: SwipeInsertInput,
): Promise<SwipeInsertResult> {
  // NOTE: this site retries ANY error (`isRetryable: () => true`) EXCEPT the
  // idempotency dedup violation — that one is a replay, not a retry: the
  // pre-existing inconsistency versus the other swipe sites, kept verbatim
  // to preserve semantics. The violation is non-retryable, so retryBounded
  // THROWS it out of the frame; the catch maps it to the winner's row.
  try {
    const outcome = await retryBounded({
      attempts: MAX_INSERT_ATTEMPTS,
      isRetryable: (err,) => !isIdempotencyUniqueViolation(err,),
      onAttempt: async () => {
        let swipeIndex: number | null = null;
        if (input.parentId) {
          const maxSwipe = await database
            .selectFrom("messages",)
            .select(database.fn.max("swipe_index",).as("max_idx",),)
            .where("chat_id", "=", input.chatId,)
            .where("parent_id", "=", input.parentId,)
            .executeTakeFirst();

          swipeIndex = (maxSwipe?.max_idx ?? 0) + 1;
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

        return swipeIndex;
      },
    },);

    if (!outcome.ok) { throw new SwipeInsertExhaustedError(); }
    return { id: input.id, swipeIndex: outcome.value ?? null, };
  } catch (err) {
    // A concurrent writer with the same (chatId, idempotencyKey) committed
    // first (migration 045 unique index). Replay that row instead of
    // surfacing a 500 to the client.
    if (isIdempotencyUniqueViolation(err,)) {
      const existingId = await findByIdempotencyKey(
        database,
        input.chatId,
        input.idempotencyKey ?? "",
      );

      if (existingId) { return { id: input.id, swipeIndex: null, replayedId: existingId, }; }
    }

    throw err;
  }
}
