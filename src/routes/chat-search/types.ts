// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

/** */
export interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

// ── Validation Schemas ──────────────────────────────────────────

/**
 * Search-priority ordering for chat results.
 *
 * - `live_first` (default): live chats sort above archived chats at equal
 *   relevance, then by recency within tier.
 * - `archive_first`: archived chats sort above live chats at equal relevance.
 *   Only honored when `includeArchived = true`; silently degrades to
 *   `live_first` when the caller did not opt in to the archived pool.
 */
export const SEARCH_PRIORITY_VALUES = ["live_first", "archive_first",] as const;
export type SearchPriority = (typeof SEARCH_PRIORITY_VALUES)[number];

export const ChatSearchQuery = t.Object({
  q: t.Optional(t.String({ minLength: 1, maxLength: 200, },),),
  type: t.Optional(t.UnionEnum(["direct", "group",],),),
  world: t.Optional(t.String({ format: "uuid", },),),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20, },),),
  offset: t.Optional(t.Numeric({ minimum: 0, default: 0, },),),
  /**
   * When true, archived chats are included in the result pool. Default false.
   * `search_priority` only takes effect when this is true.
   */
  includeArchived: t.Optional(t.Boolean(),),
  /**
   * Ordering preference for the live/archived split. See
   * `SEARCH_PRIORITY_VALUES`.
   */
  searchPriority: t.Optional(t.UnionEnum(SEARCH_PRIORITY_VALUES,),),
},);

export const JoinableQuery = t.Object({
  world: t.Optional(t.String({ format: "uuid", },),),
  location: t.Optional(t.String({ format: "uuid", },),),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20, },),),
  offset: t.Optional(t.Numeric({ minimum: 0, default: 0, },),),
},);
