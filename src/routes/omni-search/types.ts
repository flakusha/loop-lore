// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Omni-search — shared route options + validation schemas.
 */
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** */
export interface HandlerOpts {
  database: Kysely<DB>;
}

export const OmniSearchQuery = t.Object({
  /** Raw query fanned out to every surface (required). */
  q: t.String({ minLength: 1, maxLength: 200, },),
  /** Per-surface cap. */
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 10, },),),
  /** Scope message hits to one chat (in-chat search). */
  chatId: t.Optional(t.String({ format: "uuid", },),),
},);

export const OmniChatHit = t.Object({
  chatId: t.String(),
  chatName: t.String(),
  characterName: t.String(),
  characterAvatar: t.Union([t.String(), t.Null(),],),
},);

export const OmniMessageHit = t.Object({
  messageId: t.String(),
  chatId: t.String(),
  snippet: t.String(),
},);

export const OmniAssetHit = t.Object({
  assetId: t.String(),
  filename: t.String(),
  matchScore: t.Number(),
},);

export const OmniSearchResponse = t.Object({
  query: t.String(),
  chats: t.Array(OmniChatHit,),
  messages: t.Array(OmniMessageHit,),
  assets: t.Array(OmniAssetHit,),
},);
