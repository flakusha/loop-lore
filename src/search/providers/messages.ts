// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message tier providers — DB-backed `exact`, `keyword`, and `token`.
 *
 * `keyword` reuses the route's FTS5 query builder
 * (`routes/message-search/helpers.ts:buildFtsQuery`) and the `messages_fts`
 * table from `parts/016_fts.ts`; `token` serves client-pre-encrypted rows
 * via `message_search_tokens`. Authz mirrors the route: chat participants,
 * chat creators, and admins — enforced in SQL, not by importing route code.
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db";
import { buildFtsQuery, } from "../../routes/message-search/helpers";
import { deriveSearchTokens, } from "../encrypted-tokens";
import { bm25ToScore, } from "../rank";
import { matchMessageIdsByTokens, } from "../token-store";
import type { SearchHit, SearchScope, TierProvider, } from "../types";

/** Payload carried on message hits. Plaintext is null for encrypted rows. */
export interface MessageHit {
  /** messages.id. */
  messageId: string;
  /** Owning chat. */
  chatId: string;
  /** Sender role. */
  role: string;
  /** FTS-indexed mirror; null for client-pre-encrypted rows. */
  contentPlaintext: string | null;
  /** Highlight snippet for keyword hits; absent otherwise. */
  snippet?: string;
  /** messages.created_at. */
  createdAt: string;
}

/** Options for {@link createMessageProviders}. */
export interface MessageProviderOptions {
  /**
   * Load the owner's `users.encryption_secret` for the token tier.
   * Absent → token tier returns no hits (plaintext-only deployment).
   */
  resolveKey?: (userId: string,) => Promise<string | null>;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: string;
  content_plaintext: string | null;
  created_at: string;
}

/**
 * Build the access predicate shared by all message tiers: the row's chat
 * must be visible to the searching user (participant, creator, or admin),
 * optionally pinned to one chat.
 */
function accessWhere(scope: Extract<SearchScope, { kind: "messages" }>,): ReturnType<typeof sql> {
  if (scope.isAdmin === true && scope.chatId === undefined) { return sql`1 = 1`; }
  const parts: ReturnType<typeof sql>[] = [];
  if (scope.isAdmin !== true) {
    parts.push(sql`m.chat_id IN (
      SELECT chat_id FROM chat_participants WHERE actor_id = ${scope.userId}
      UNION
      SELECT id FROM chats WHERE created_by = ${scope.userId}
    )`,);
  }
  if (scope.chatId !== undefined) { parts.push(sql`m.chat_id = ${scope.chatId}`,); }
  if (parts.length === 0) { return sql`1 = 1`; }
  return sql.join(parts, sql` AND `,);
}

function toHit(row: MessageRow, score: number, snippet?: string,): SearchHit<MessageHit> {
  return {
    id: row.id,
    score,
    source: "fts",
    payload: {
      messageId: row.id,
      chatId: row.chat_id,
      role: row.role,
      contentPlaintext: row.content_plaintext,
      snippet,
      createdAt: row.created_at,
    },
  };
}

/**
 * Create DB-backed message tier providers.
 * @param db - typed Kysely instance
 * @param opts - optional key resolver enabling the token tier
 * @returns exact/keyword/token providers for the service
 */
export function createMessageProviders(
  db: Kysely<DB>,
  opts?: MessageProviderOptions,
): { exact: TierProvider<MessageHit>; keyword: TierProvider<MessageHit>; token: TierProvider<MessageHit> } {
  const exact: TierProvider<MessageHit> = async (query, scope,) => {
    if (scope.kind !== "messages") { return []; }
    const access = accessWhere(scope,);
    const rows = await sql<MessageRow>`
      SELECT m.id, m.chat_id, m.role, m.content_plaintext, m.created_at
      FROM messages m WHERE m.id = ${query.q} AND ${access} LIMIT 1
    `.execute(db,);
    const row = rows.rows[0];
    if (row === undefined) { return []; }
    return [{ ...toHit(row, 1,), source: "db", },];
  };

  const keyword: TierProvider<MessageHit> = async (query, scope,) => {
    if (scope.kind !== "messages") { return []; }
    const ftsQuery = buildFtsQuery(query.q,);
    if (ftsQuery === "") { return []; }
    const access = accessWhere(scope,);
    const topK = query.topK ?? 20;
    const rows = await sql<MessageRow & { snippet: string; rank: number }>`
      SELECT m.id, m.chat_id, m.role, m.content_plaintext, m.created_at,
        snippet(messages_fts, 2, '<mark>', '</mark>', '…', 30) AS snippet,
        bm25(messages_fts) AS rank
      FROM messages_fts
      JOIN messages m ON m.id = messages_fts.message_id
      WHERE messages_fts MATCH ${ftsQuery} AND ${access}
      ORDER BY rank ASC LIMIT ${topK}
    `.execute(db,);
    return rows.rows.map((row,) => toHit(row, bm25ToScore(-row.rank,), row.snippet,));
  };

  const token: TierProvider<MessageHit> = async (query, scope,) => {
    if (scope.kind !== "messages" || opts?.resolveKey === undefined) { return []; }
    const key = await opts.resolveKey(scope.userId,);
    if (key === null) { return []; }
    const tokens = await deriveSearchTokens(query.q, key,);
    const topK = query.topK ?? 20;
    const matches = await matchMessageIdsByTokens(db, tokens, scope.userId, topK,);
    if (matches.length === 0) { return []; }
    const access = accessWhere(scope,);
    const ids = matches.map((m,) => m.messageId);
    // Bound parameters, never string-joined (kysely dynamic-IN pattern).
    const idList = sql.join(ids.map((id,) => sql`${id}`),);
    const rows = await sql<MessageRow>`
      SELECT m.id, m.chat_id, m.role, m.content_plaintext, m.created_at
      FROM messages m WHERE m.id IN (${idList}) AND ${access}
    `.execute(db,);
    const byId = new Map(rows.rows.map((row,) => [row.id, row,]),);
    const ceiling = matches[0]?.hits ?? 1;
    const hits: SearchHit<MessageHit>[] = [];
    for (const match of matches) {
      const row = byId.get(match.messageId,);
      if (row !== undefined) {
        hits.push({ ...toHit(row, match.hits / ceiling,), source: "token", encryptedMatch: true, },);
      }
    }
    return hits;
  };

  return { exact, keyword, token, };
}
