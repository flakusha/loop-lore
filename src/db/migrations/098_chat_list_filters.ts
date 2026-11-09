// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 098_chat_list_filters
 *
 * Server-side persistence for the chat-list filter panel
 * (TASK-server-side-room-filter-enforcement). Until now the filters existed
 * only client-side (`src/frontend/alpine/chat-filters.ts` + the
 * `chat-sidebar-filters` localStorage key), so they were lost on a wiped
 * browser and invisible to the server list endpoint.
 *
 * One row per user, upserted by `PUT /api/v1/chats/filters` as a full
 * snapshot; `GET /api/v1/chats` falls back to the stored value for any
 * filter dimension the request omits (an explicit query param always wins),
 * which is the enforcement half. Columns mirror the client panel keys:
 *
 * - `chat_type`    — "all" | "direct" | "group"   (query param `type`)
 * - `archived`     — "all" | "active" | "archived" (query param `archived`,
 *                    "active" → archived=false, "archived" → archived=true;
 *                    archive state lives on `chats.is_pinned`)
 * - `sort`         — "recent" | "name" | "unread" | "pinned-first"
 * - `world_id`     — NULL = no world filter (query param `world`)
 * - `min_messages` / `max_messages` — NULL = unset visible-message bounds
 * - `updated_since` — NULL = no cutoff (query param `updatedSince`)
 *
 * `user_id` cascades on user deletion like `world_timeline_selections`;
 * enum-shaped text columns are validated at the route boundary by the closed
 * `ChatListFiltersBody` DTO (`src/validation/schemas/chat.ts`), not by CHECK
 * constraints, matching the repo's stored-enum style elsewhere.
 */
import { type Kysely, } from "kysely";

/** Create the per-user chat-list filter snapshot table. */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("chat_list_filters",)
    .addColumn("user_id", "text", (col,) => col.notNull().primaryKey().references("users.id",).onDelete("cascade",),)
    .addColumn("chat_type", "text", (col,) => col.notNull().defaultTo("all",),)
    .addColumn("archived", "text", (col,) => col.notNull().defaultTo("all",),)
    .addColumn("sort", "text", (col,) => col.notNull().defaultTo("recent",),)
    .addColumn("world_id", "text",)
    .addColumn("min_messages", "integer",)
    .addColumn("max_messages", "integer",)
    .addColumn("updated_since", "text",)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();
}

/** Drop the chat-list filter snapshot table. */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("chat_list_filters",).execute();
}
