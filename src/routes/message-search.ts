// src/routes/message-search.ts
//
// Full-text message search across one chat or all the user's chats, backed by
// the `messages_fts` FTS5 virtual table (see src/db/migrations/034_message_search_fts.ts).
//
// Filters compose with AND: chatId (scope), q (FTS5 MATCH), role, hasAttachment,
// dateFrom/dateTo, plus limit/offset pagination. Results include a match snippet
// (with <mark> spans when q is given), a bm25 relevance score, and pagination info.
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { checkChatAccess, } from "../chat/service";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { jsonParseOr, } from "../utils";
import {
  ErrorResponse,
  MessageSearchQuery,
  MessageSearchResponse,
} from "../validation/schemas";
import { extractAuth, jsonResponse, notFoundResponse as notFound, requireUserId, } from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "message-search", },);
}

interface HandlerOpts {
  database: Kysely<DB>;
}

interface MessageSearchRow {
  messageId: string;
  chatId: string;
  chatName: string | null;
  chatCharacterName: string | null;
  role: string;
  content: string;
  matchContext: string;
  createdAt: string;
  attachments: string | null;
  matchScore: number;
}

const SNIPPET_BEFORE = "<mark>";
const SNIPPET_AFTER = "</mark>";
const SNIPPET_ELLIPSIS = "…";
const SNIPPET_LENGTH = 30;

/**
 * Turn raw user input into a safe FTS5 MATCH query.
 *
 * Each whitespace-separated token is wrapped in double quotes (escaping inner
 * quotes) so it is treated as a literal phrase/term rather than an operator.
 * Tokens are joined with a space (FTS5 default AND). This prevents FTS query
 * syntax errors and injection via operators like `->`, `*`, or `NEAR`.
 */
function buildFtsQuery(raw: string,): string {
  return raw
    .split(/\s+/,)
    .filter((t,) => t.length > 0,)
    .map((token,) => `"${token.replace(/"/g, '""')}"`,)
    .join(" ");
}

/**
 * Parse the stored `messages.attachments` JSON into the response attachment list.
 */
function parseAttachments(raw: string | null,): unknown[] {
  if (!raw) { return []; }
  return jsonParseOr<unknown[]>(raw, [],);
}

/**
 * Build the shared extra WHERE fragment: " AND <cond1> AND <cond2>…" or nothing.
 *
 * Access policy mirrors `checkChatAccess`: chat creator, admin, solo, and any
 * chat participant may see a chat's messages. When `chatId` is given the caller
 * must already have passed `checkChatAccess` (we return 404 otherwise).
 */
function extraWhere(
  query: typeof MessageSearchQuery.static,
  userId: string,
  userRole: string | null,
  isSingleChat: boolean,
): ReturnType<typeof sql.join> {
  const clauses: ReturnType<typeof sql>[] = [];

  if (!isSingleChat && userRole !== "admin" && userRole !== "solo") {
    clauses.push(sql`m.chat_id IN (
      SELECT chat_id FROM chat_participants WHERE actor_id = ${userId}
      UNION
      SELECT id FROM chats WHERE created_by = ${userId}
    )`);
  }
  if (query.chatId) { clauses.push(sql`m.chat_id = ${query.chatId}`); }
  if (query.role) { clauses.push(sql`m.role = ${query.role}`); }
  if (query.hasAttachment === "true") {
    clauses.push(sql`m.attachments IS NOT NULL AND m.attachments != '[]'`);
  }
  if (query.dateFrom) { clauses.push(sql`m.created_at >= ${query.dateFrom}`); }
  if (query.dateTo) { clauses.push(sql`m.created_at <= ${query.dateTo}`); }

  if (clauses.length === 0) { return sql` `; }
  return sql` AND ${sql.join(clauses, sql` AND `)}`;
}

export function messageSearchRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "message-search", },)
      .get(
        "/api/messages/search",
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
            const access = await checkChatAccess(database, query.chatId, userId, userRole);
            if (!access.ok) { return notFound("Chat not found",); }
          }

          const ftsQuery = q ? buildFtsQuery(q,) : null;
          const where = extraWhere(query, userId, userRole, Boolean(query.chatId,),);

          let rows: MessageSearchRow[];
          let total: number;

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

            const counted = await sql<{ total: number }>`
              SELECT COUNT(*) AS total
              FROM messages_fts
              JOIN messages m ON m.id = messages_fts.message_id
              JOIN chats c ON c.id = m.chat_id
              WHERE messages_fts MATCH ${ftsQuery}${where}
            `.execute(database,);
            total = counted.rows[0]?.total ?? 0;
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

            const counted = await sql<{ total: number }>`
              SELECT COUNT(*) AS total
              FROM messages m
              JOIN chats c ON c.id = m.chat_id
              WHERE 1=1${where}
            `.execute(database,);
            total = counted.rows[0]?.total ?? 0;
          }

          const results = rows.map((row,) => ({
            messageId: row.messageId,
            chatId: row.chatId,
            chatName: row.chatName,
            chatCharacterName: row.chatCharacterName,
            role: row.role,
            content: row.content,
            matchContext: row.matchContext ?? "",
            createdAt: row.createdAt,
            attachments: parseAttachments(row.attachments,),
            matchScore: row.matchScore ?? 0,
          }));

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
            description:
              "Full-text search over message content, scoped to one chat or all accessible chats. " +
              "Filters compose with AND: chatId, q (FTS5 MATCH), role, hasAttachment, dateFrom/dateTo, limit/offset.",
            tags: ["Messages", "Search",],
          },
        },
      )
  );
}
