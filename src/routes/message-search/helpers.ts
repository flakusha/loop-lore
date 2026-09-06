// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message search — pure query-building + logging helpers shared by the search
 * route.
 */
import { sql, } from "kysely";
import { getLogger, type Logger, } from "../../logger";
import { can, } from "../../users/permissions";
import { jsonParseOr, } from "../../utils";
import type { MessageSearchQuery, } from "../../validation/schemas";

/** */
export function log(): Logger {
  return getLogger().child({ module: "message-search", },);
}

/** */
export interface MessageSearchRow {
  messageId: string;
  chatId: string;
  chatName: string | null;
  chatCharacterName: string | null;
  role: string;
  content: string;
  contentEncoding: string;
  keyId: string | null;
  /** Plaintext mirror indexed by FTS5 (null for client-pre-encrypted rows). */
  contentPlaintext: string | null;
  matchContext: string;
  createdAt: string;
  attachments: string | null;
  matchScore: number;
}

export const SNIPPET_BEFORE = "<mark>";
export const SNIPPET_AFTER = "</mark>";
export const SNIPPET_ELLIPSIS = "…";
export const SNIPPET_LENGTH = 30;

/**
 * Turn raw user input into a safe FTS5 MATCH query.
 *
 * Each whitespace-separated token is wrapped in double quotes (escaping inner
 * quotes) so it is treated as a literal phrase/term rather than an operator.
 * Tokens are joined with a space (FTS5 default AND). This prevents FTS query
 * syntax errors and injection via operators like `->`, `*`, or `NEAR`.
 * @param raw
 */
export function buildFtsQuery(raw: string,): string {
  const tokens: string[] = [];
  for (const t of raw.split(/\s+/,)) {
    if (t.length > 0) {
      tokens.push(`"${t.replaceAll('"', '""',)}"`,);
    }
  }
  return tokens.join(" ",);
}

/**
 * Parse the stored `messages.attachments` JSON into the response attachment list.
 * @param raw
 */
export function parseAttachments(raw: string | null,): unknown[] {
  if (!raw) { return []; }
  return jsonParseOr<unknown[]>(raw, [],);
}

/**
 * Build the shared extra WHERE fragment: " AND <cond1> AND <cond2>…" or nothing.
 *
 * Access policy mirrors `checkChatAccess`: chat creator, admin, solo, and any
 * chat participant may see a chat's messages. When `chatId` is given the caller
 * must already have passed `checkChatAccess` (we return 404 otherwise).
 * @param query
 * @param userId
 * @param userRole
 * @param isSingleChat
 */
export function extraWhere(
  query: typeof MessageSearchQuery.static,
  userId: string,
  userRole: string | null,
  isSingleChat: boolean,
): ReturnType<typeof sql.join> {
  const clauses: ReturnType<typeof sql>[] = [];

  if (!isSingleChat && !can(userRole, "admin.chat",)) {
    clauses.push(sql`
      m.chat_id IN (
            SELECT chat_id FROM chat_participants WHERE actor_id = ${userId}
            UNION
            SELECT id FROM chats WHERE created_by = ${userId}
          )
    `,);
  }
  if (query.chatId) { clauses.push(sql`m.chat_id = ${query.chatId}`,); }
  if (query.role) { clauses.push(sql`m.role = ${query.role}`,); }
  if (query.hasAttachment === "true") {
    clauses.push(sql`m.attachments IS NOT NULL AND m.attachments != '[]'`,);
  }
  if (query.dateFrom) { clauses.push(sql`m.created_at >= ${query.dateFrom}`,); }
  if (query.dateTo) { clauses.push(sql`m.created_at <= ${query.dateTo}`,); }

  if (clauses.length === 0) { return sql` `; }
  const joined = sql.join(clauses, sql` AND `,);
  return sql` AND ${joined}`;
}
