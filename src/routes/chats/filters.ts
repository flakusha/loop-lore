// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-user chat-list filter persistence (TASK-server-side-room-filter-enforcement).
 *
 * Until this module the filter panel lived only in the client
 * (`chat-filters.ts` + localStorage), so filters vanished with browser state
 * and the server list endpoint never saw them. Two halves:
 *
 * - Persistence: `GET/PUT /api/v1/chats/filters` upsert the full panel
 *   snapshot (closed `ChatListFiltersBody` DTO) into `chat_list_filters`,
 *   one row per user (migration 098).
 * - Enforcement: `resolveChatListFilters` fills every filter dimension the
 *   `GET /api/v1/chats` request OMITS from the stored snapshot — an explicit
 *   query param always wins, so an API consumer that already sends filters
 *   keeps today's exact behavior. Guests and users who never saved a
 *   snapshot have none, and the list stays unfiltered as before.
 */
import { Value, } from "@sinclair/typebox/value";
import { Elysia, t, } from "elysia";
import type { Kysely, Selectable, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonParse, } from "../../utils";
import { ChatListFiltersBody, } from "../../validation/schemas";
import { jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/** The chat-list filter snapshot as stored and served (camelCase public keys). */
export interface ChatListFilterSnapshot {
  type: "all" | "direct" | "group";
  status: "all" | "active" | "archived";
  sort: "recent" | "name" | "unread" | "pinned-first";
  /** World uuid the list is narrowed to; null = no world filter. */
  world: string | null;
  minMessages: number | null;
  maxMessages: number | null;
  updatedSince: string | null;
}

/**
 * Snapshot for users who never saved filters: every dimension off. NOT
 * exported: it is a plain object whose string `type` key would trip the
 * schema-fuzz generator's isTypeBoxSchema heuristic (a top-level string
 * `type` field reads as a JSON-Schema type keyword), and it is not a schema.
 */
const DEFAULT_CHAT_LIST_FILTERS: ChatListFilterSnapshot = {
  type: "all",
  status: "all",
  sort: "recent",
  world: null,
  minMessages: null,
  maxMessages: null,
  updatedSince: null,
};

/** The seven filter dimensions as `GET /api/v1/chats` consumes them. */
export interface ResolvedChatListFilters {
  type: "direct" | "group" | undefined;
  /** Query-param vocabulary: "true"/"1" archived-only, "false"/"0" active-only. */
  archived: string | undefined;
  sort: string;
  world: string | undefined;
  minMessages: number | undefined;
  maxMessages: number | undefined;
  updatedSince: string | undefined;
}

/** The filter dimensions as they arrive on the list request's query string. */
export interface ExplicitChatListFilters {
  type?: "direct" | "group";
  archived?: string;
  sort?: string;
  world?: string;
  minMessages?: number;
  maxMessages?: number;
  updatedSince?: string;
}

type ChatListFiltersRow = Selectable<DB["chat_list_filters"]>;
/** Row → public snapshot (snake_case columns → camelCase keys). */
function toSnapshot(row: ChatListFiltersRow,): ChatListFilterSnapshot {
  return {
    type: row.chat_type as ChatListFilterSnapshot["type"],
    status: row.archived as ChatListFilterSnapshot["status"],
    sort: row.sort as ChatListFilterSnapshot["sort"],
    world: row.world_id,
    minMessages: row.min_messages,
    maxMessages: row.max_messages,
    updatedSince: row.updated_since,
  };
}

/**
 * Load the stored filter snapshot for a user.
 * @param database
 * @param userId
 * @returns the snapshot, or null when the user never saved one (guests and
 * clean users keep the unfiltered list — enforcement must not invent filters)
 */
export async function loadChatListFilters(
  database: Kysely<DB>,
  userId: string,
): Promise<ChatListFilterSnapshot | null> {
  const row = await database
    .selectFrom("chat_list_filters",)
    .selectAll()
    .where("user_id", "=", userId,)
    .executeTakeFirst();

  return row ? toSnapshot(row,) : null;
}

/**
 * Merge the request's explicit filters over the stored snapshot: every
 * omitted dimension falls back to the stored value ("all"/"recent"/null
 * stored values mean "no filter" and stay undefined).
 * @param explicit what the request itself sent (undefined = omitted)
 * @param stored the user's saved snapshot, or null when none exists
 * @returns filter values ready for the list query builders
 */
export function resolveChatListFilters(
  explicit: ExplicitChatListFilters,
  stored: ChatListFilterSnapshot | null,
): ResolvedChatListFilters {
  return {
    type: explicit.type ??
      (stored?.type === "direct" || stored?.type === "group" ? stored.type : undefined),
    archived: explicit.archived ??
      (stored?.status === "active" ? "false" : stored?.status === "archived" ? "true" : undefined),
    sort: explicit.sort ?? stored?.sort ?? "recent",
    world: explicit.world ?? stored?.world ?? undefined,
    minMessages: explicit.minMessages ?? stored?.minMessages ?? undefined,
    maxMessages: explicit.maxMessages ?? stored?.maxMessages ?? undefined,
    updatedSince: explicit.updatedSince ?? stored?.updatedSince ?? undefined,
  };
}

/**
 * Mount `GET/PUT /api/v1/chats/filters` — per-user filter snapshot persistence.
 * @param opts
 * @param prefix
 * @throws {Error}
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chat_list_filters: { put: { body: unknown; params: {}; query: {}; headers: unknown; response: unknown; }; }; }; }, { ......}
 */
export function chatFilterRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-filters", },)
      // GET — the stored snapshot, or the all-clear default for a clean user.
      .get(
        `${prefix}/chats/filters`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const stored = await loadChatListFilters(database, userId,);
          return jsonResponse({ data: stored ?? DEFAULT_CHAT_LIST_FILTERS, },);
        },
        {
          response: {
            200: t.Object({
              data: t.Object({
                type: t.String(),
                status: t.String(),
                sort: t.String(),
                world: t.Nullable(t.String(),),
                minMessages: t.Nullable(t.Number(),),
                maxMessages: t.Nullable(t.Number(),),
                updatedSince: t.Nullable(t.String(),),
              },),
            },),
          },
          detail: {
            summary: "Get the caller's saved chat-list filter snapshot",
            tags: ["Chats",],
          },
        },
      )
      // PUT — upsert the FULL snapshot (closed DTO; unknown keys → 422).
      .put(
        `${prefix}/chats/filters`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          // Re-check the RAW body: Elysia strips unknown keys of a body
          // schema instead of refusing them (the settings.ts precedent), so
          // the framework-validated `ctx.body` alone would silently drop
          // extras. The chats barrel's parse hook stashes the raw JSON text
          // as `rawBodyText`; Value.Check against the closed DTO (which
          // carries additionalProperties: false) is what turns an unknown
          // key into the 422 this route owes the caller.
          const rawText = (ctx as { rawBodyText?: unknown }).rawBodyText;
          const raw = typeof rawText === "string" ? safeJsonParse(rawText,) : null;
          if (!raw?.ok || !Value.Check(ChatListFiltersBody, raw.value,)) {
            return jsonError("Validation failed", 422,);
          }

          // The user id comes from the session, never the body.
          const body = raw.value as ChatListFilterSnapshot;
          const now = new Date().toISOString();
          const worldId = body.world === "" ? null : body.world;
          // One shared column map for INSERT and conflict-UPDATE so the two
          // paths cannot drift apart.
          const snapshotColumns = {
            chat_type: body.type,
            archived: body.status,
            sort: body.sort,
            world_id: worldId,
            min_messages: body.minMessages,
            max_messages: body.maxMessages,
            updated_since: body.updatedSince,
            updated_at: now,
          };

          await database
            .insertInto("chat_list_filters",)
            .values({ user_id: userId, ...snapshotColumns, },)
            .onConflict((oc,) => oc.column("user_id",).doUpdateSet(snapshotColumns,))
            .execute();

          return jsonResponse({ data: body, },);
        },
        {
          body: ChatListFiltersBody,
          detail: {
            summary: "Replace the caller's saved chat-list filter snapshot",
            tags: ["Chats",],
          },
        },
      )
  );
}
