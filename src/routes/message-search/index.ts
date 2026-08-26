// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/message-search/
//
// Full-text message search across one chat or all the user's chats, backed by
// the `messages_fts` FTS5 virtual table (see src/db/migrations/034_message_search_fts.ts).
//
// Filters compose with AND: chatId (scope), q (FTS5 MATCH), role, hasAttachment,
// dateFrom/dateTo, plus limit/offset pagination. Results include a match snippet
// (with <mark> spans when q is given), a bm25 relevance score, and pagination info.
//
// Barrel facade — registration point/name (`message-search`) preserved so the
// `elysia-app.ts` wiring is unchanged.
import { Elysia, } from "elysia";
import type { QueryResult, } from "kysely";
import { sql, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import {
  ErrorResponse,
  MessageSearchQuery,
  MessageSearchResponse,
} from "../../validation/schemas";
import { extractAuth, jsonResponse, notFoundResponse as notFound, requireUserId, } from "../http-utils";
import { resolveMessageContent, } from "../messages/helpers";
import {
  buildFtsQuery,
  extraWhere,
  log,
  type MessageSearchRow,
  parseAttachments,
  SNIPPET_AFTER,
  SNIPPET_BEFORE,
  SNIPPET_ELLIPSIS,
  SNIPPET_LENGTH,
} from "./helpers";
import type { HandlerOpts, } from "./types";

export type { HandlerOpts, } from "./types";

export function messageSearchRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "message-search", },)
      .get(
        `${prefix}/messages/search`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          const query = ctx.query as typeof MessageSearchQuery.static;
          const limit = query.limit ?? 50;
          const offset = query.offset ?? 0;
          const q = (query.q ?? "").trim();

          // Single-chat scope: verify access first.
          if (query.chatId) {
            const access = await checkChatAccess(database, query.chatId, userId, userRole,);
            if (!access.ok) { return notFound("Chat not found",); }
          }

          const ftsQuery = q ? buildFtsQuery(q,) : null;
          const where = extraWhere(query, userId, userRole, Boolean(query.chatId,),);

          let rows: MessageSearchRow[];
          let counted: QueryResult<{ total: number }> | undefined;

          if (ftsQuery) {
            const result = await sql<MessageSearchRow>`
              SELECT
                m.id AS messageId,
                m.chat_id AS chatId,
                c.name AS chatName,
                (SELECT a.display_name
                   FROM chat_participants cp
                   JOIN actors a ON a.id = cp.actor_id
                  WHERE cp.chat_id = c.id AND a.actor_type = 'character'
                  LIMIT 1) AS chatCharacterName,
                m.role AS role,
                m.content AS content,
                m.content_encoding AS contentEncoding,
                m.key_id AS keyId,
                snippet(messages_fts, 2, ${SNIPPET_BEFORE}, ${SNIPPET_AFTER}, ${SNIPPET_ELLIPSIS}, ${SNIPPET_LENGTH}) AS matchContext,
                m.created_at AS createdAt,
                m.attachments AS attachments,
                bm25(messages_fts) AS matchScore
              FROM messages_fts
              JOIN messages m ON m.id = messages_fts.message_id
              JOIN chats c ON c.id = m.chat_id
              WHERE messages_fts MATCH ${ftsQuery}${where}
              ORDER BY bm25(messages_fts) ASC
              LIMIT ${limit} OFFSET ${offset}
            `.execute(database,);
            rows = result.rows;

            counted = await sql<{ total: number }>`
              SELECT COUNT(*) AS total
              FROM messages_fts
              JOIN messages m ON m.id = messages_fts.message_id
              JOIN chats c ON c.id = m.chat_id
              WHERE messages_fts MATCH ${ftsQuery}${where}
            `.execute(database,);
          } else {
            const result = await sql<MessageSearchRow>`
              SELECT
                m.id AS messageId,
                m.chat_id AS chatId,
                c.name AS chatName,
                (SELECT a.display_name
                   FROM chat_participants cp
                   JOIN actors a ON a.id = cp.actor_id
                  WHERE cp.chat_id = c.id AND a.actor_type = 'character'
                  LIMIT 1) AS chatCharacterName,
                m.role AS role,
                m.content AS content,
                m.content_encoding AS contentEncoding,
                m.key_id AS keyId,
                substr(m.content, 1, 160) AS matchContext,
                m.created_at AS createdAt,
                m.attachments AS attachments,
                0 AS matchScore
              FROM messages m
              JOIN chats c ON c.id = m.chat_id
              WHERE 1=1${where}
              ORDER BY m.created_at DESC
              LIMIT ${limit} OFFSET ${offset}
            `.execute(database,);
            rows = result.rows;

            counted = await sql<{ total: number }>`
              SELECT COUNT(*) AS total
              FROM messages m
              JOIN chats c ON c.id = m.chat_id
              WHERE 1=1${where}
            `.execute(database,);
          }

          const total = counted?.rows[0]?.total ?? 0;

          // Resolve each row's content via the shared helper so the response
          // never carries raw encryption envelopes (data leak on standard-tier
          // chats) nor base64 gzip (which makes snippets unreadable).
          // Encrypted rows get an empty snippet — FTS5 indexed ciphertext, so
          // any snippet it produces is garbage. See BUG-message-search for
          // the policy decision on FTS indexing of encrypted content.
          const results = [];
          for (
            const settled of await Promise.allSettled(
              Array.from(rows, async (row,) => {
                let resolved: string;
                try {
                  resolved = await resolveMessageContent(database, {
                    content: row.content,
                    content_encoding: row.contentEncoding,
                    key_id: row.keyId,
                    chat_id: row.chatId,
                  },);
                } catch {
                  resolved = "[Encrypted — unable to decrypt]";
                }
                const snippet = row.keyId
                  ? ""
                  : (row.matchContext ?? "").slice(0, SNIPPET_LENGTH * 4,);
                return {
                  messageId: row.messageId,
                  chatId: row.chatId,
                  chatName: row.chatName,
                  chatCharacterName: row.chatCharacterName,
                  role: row.role,
                  content: resolved,
                  matchContext: snippet,
                  createdAt: row.createdAt,
                  attachments: parseAttachments(row.attachments,),
                  matchScore: row.matchScore,
                };
              },),
            )
          ) {
            if (settled.status === "fulfilled") {
              results.push(settled.value,);
            } else {
              results.push({
                messageId: "unknown",
                chatId: "unknown",
                chatName: null,
                chatCharacterName: null,
                role: "user",
                content: "[Encrypted — unable to decrypt]",
                matchContext: "",
                createdAt: new Date(0,).toISOString(),
                matchScore: 0,
              },);
            }
          }

          log().info("Message search", {
            chatId: query.chatId ?? null,
            q,
            role: query.role ?? null,
            hasAttachment: query.hasAttachment ?? null,
            resultCount: results.length,
            total,
          },);

          return jsonResponse({
            results,
            total,
            hasMore: offset + results.length < total,
            query: q,
          },);
        },
        {
          query: MessageSearchQuery,
          response: {
            200: MessageSearchResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Search messages",
            description: "Full-text search over message content, scoped to one chat or all accessible chats. " +
              "Filters compose with AND: chatId, q (FTS5 MATCH), role, hasAttachment, dateFrom/dateTo, limit/offset.",
            tags: ["Messages", "Search",],
          },
        },
      )
  );
}
