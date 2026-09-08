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
import type { DB, } from "../db";
import { deriveSearchTokens, } from "./encrypted-tokens";

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
    .values(tokens.map((token,) => ({ message_id: messageId, token, scope, })),)
    .execute();
  return tokens.length;
}

/**
 * Remove all stored tokens for one message (delete path).
 * @param db - typed Kysely instance
 * @param messageId - owning message row
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
    .where("token", "in", tokens,)
    .groupBy("message_id",)
    .orderBy(sql`count(*)`, "desc",)
    .limit(limit,)
    .execute();
  return rows.map((row,) => ({ messageId: row.message_id, hits: Number(row.hits,), }));
}
