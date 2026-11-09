// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Ciphertext-token persistence for `message_search_tokens`.
 *
 * Write path for encrypt-time indexing: derive blind tokens via
 * `deriveSearchTokens` and store them under the owner's `scope` (the user
 * id whose `encryption_secret` blinded them). Read path backs the service's
 * `token` tier: match query tokens, rank messages by shared-token count.
 *
 * Kysely types only — no runtime DB imports (mirrors `memory/embeddings.ts`).
 */
import { type Kysely, sql, } from "kysely";
import { isUsableEncryptionSecret, } from "../crypto/user-secret";
import type { DB, } from "../db";
import { getChildLogger, type Logger, } from "../logger";
import { deriveSearchTokens, } from "./encrypted-tokens";

/**
 * Module logger accessor — null until a host process seeds the global logger.
 * @returns the child logger, or null when no logger is initialized.
 */
const log = (): Logger | null => getChildLogger("search/token-store",);

/**
 * Feature flag for encrypt-time token indexing
 * (TASK-encrypted-search-minimal-first-slice). Off (default) = zero behavior
 * change at every message write site; on = each server-encrypted message
 * without a plaintext mirror also gets blind search tokens.
 * @returns true when `ENABLE_TOKEN_INDEXING=1`
 */
export function isTokenIndexingEnabled(): boolean {
  return process.env.ENABLE_TOKEN_INDEXING === "1";
}

/** Input for {@link indexMessageSearchTokens}. */
export interface IndexMessageTokensOpts {
  /** Persisted message row id (its FK target must already exist). */
  messageId: string;
  /** Owning chat; its `created_by` scopes and keys the derivation. */
  chatId: string;
  /** Server-known plaintext the row's ciphertext was encrypted from. */
  plaintext: string;
  /** `key_id` stored on the row; null = the row is plaintext. */
  keyId: string | null;
  /** Plaintext mirror persisted alongside the row, if any (FTS-covered). */
  plaintextMirror?: string | null;
}

/**
 * Index blind search tokens for one server-encrypted message (write side of
 * the `token` tier). Skipped — without error — when the flag is off, the row
 * is plaintext (`keyId === null`) or carries a plaintext mirror (both
 * FTS-covered), the chat tier is `none`, or the chat owner has no usable
 * `users.encryption_secret`. Tokens are blinded with the chat owner's key and
 * stored under their id, so owner searches match; extending matches to every
 * participant is future work per the ticket.
 *
 * Fail-open by contract: an indexing failure logs a warning and returns 0 —
 * search is secondary and must never break a message write.
 * @param db - typed Kysely instance
 * @param opts - message identity, plaintext, and encryption markers
 * @returns number of token rows written (0 on any skip)
 * @remarks call only AFTER the messages row exists (`message_search_tokens`
 * carries a hard FK to `messages.id` and `PRAGMA foreign_keys = ON`).
 */
export async function indexMessageSearchTokens(
  db: Kysely<DB>,
  opts: IndexMessageTokensOpts,
): Promise<number> {
  if (isTokenIndexingEnabled() !== true) { return 0; }
  if (opts.keyId === null) { return 0; }
  if (opts.plaintextMirror !== undefined && opts.plaintextMirror !== null && opts.plaintextMirror !== "") {
    return 0;
  }

  try {
    const chat = await db
      .selectFrom("chats",)
      .select(["created_by", "encryption_level",],)
      .where("id", "=", opts.chatId,)
      .executeTakeFirst();

    if (chat === undefined || chat.encryption_level === "none") { return 0; }

    const secret = await db
      .selectFrom("users",)
      .select("encryption_secret",)
      .where("id", "=", chat.created_by,)
      .executeTakeFirst();

    if (isUsableEncryptionSecret(secret?.encryption_secret ?? null,) !== true) { return 0; }

    return await reindexMessageTokens(
      db,
      opts.messageId,
      opts.plaintext,
      secret!.encryption_secret!,
      chat.created_by,
    );
  } catch (error) {
    log()?.warn("message token indexing failed (search stays stale)", {
      messageId: opts.messageId,
      chatId: opts.chatId,
      err: error instanceof Error ? error.message : String(error,),
    },);

    return 0;
  }
}

/** One token-matched message, ranked by shared-token count. */
export interface TokenMatch {
  /** Owning message id. */
  messageId: string;
  /** How many query tokens hit this message. */
  hits: number;
}

/**
 * Replace all stored tokens for one message with a fresh derivation.
 * @param db - typed Kysely instance
 * @param messageId - owning message row
 * @param plaintext - message content (decrypted, at encrypt time)
 * @param userKey - owner's `users.encryption_secret`
 * @param scope - owner user id (isolates per-user tokens on lookup)
 * @returns number of tokens stored (0 when plaintext yields none)
 */
export async function reindexMessageTokens(
  db: Kysely<DB>,
  messageId: string,
  plaintext: string,
  userKey: string | Uint8Array,
  scope: string,
): Promise<number> {
  await deleteMessageTokens(db, messageId,);
  const tokens = await deriveSearchTokens(plaintext, userKey,);
  if (tokens.length === 0) { return 0; }
  await db
    .insertInto("message_search_tokens",)
    .values(tokens.map((term,) => ({ message_id: messageId, term, scope, })),)
    .execute();

  return tokens.length;
}

/**
 * Remove all stored tokens for one message (delete path).
 * @param db - typed Kysely instance
 * @param messageId - owning message row
 * @returns {Promise<void>}
 */
export async function deleteMessageTokens(db: Kysely<DB>, messageId: string,): Promise<void> {
  await db.deleteFrom("message_search_tokens",).where("message_id", "=", messageId,).execute();
}

/**
 * Find messages sharing the most tokens with the query set.
 * @param db - typed Kysely instance
 * @param tokens - derived query tokens (same key + scope as stored rows)
 * @param scope - owner user id to restrict the lookup to
 * @param limit - max messages to return
 * @returns matches ordered by shared-token count descending
 */
export async function matchMessageIdsByTokens(
  db: Kysely<DB>,
  tokens: string[],
  scope: string,
  limit = 50,
): Promise<TokenMatch[]> {
  if (tokens.length === 0) { return []; }
  const rows = await db
    .selectFrom("message_search_tokens",)
    .select(["message_id", sql<number>`count(*)`.as("hits",),],)
    .where("scope", "=", scope,)
    .where("term", "in", tokens,)
    .groupBy("message_id",)
    .orderBy(sql`count(*)`, "desc",)
    .limit(limit,)
    .execute();

  return rows.map((row,) => ({ messageId: row.message_id, hits: Number(row.hits,), }));
}
