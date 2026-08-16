// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message route validation schemas.
 */

import { t, } from "elysia";
import {
  Id,
  MessageContentTypeSchema,
  MessageRoleSchema,
  MessageStatusSchema,
  MessageVisibilitySchema,
  OptionalId,
} from "./primitives";

// ── Message routes ─────────────────────────────────────────

export const MessageCreateBody = t.Object({
  content: t.String({ minLength: 1, },),
  parentId: OptionalId,
  role: t.Optional(MessageRoleSchema,),
  contentType: t.Optional(MessageContentTypeSchema,),
  idempotencyKey: t.Optional(t.String(),),
  attachments: t.Optional(
    t.Array(
      t.Object({
        assetId: t.String(),
        order: t.Optional(t.Numeric(),),
        caption: t.Optional(t.String(),),
        label: t.Optional(t.String(),),
      },),
    ),
  ),
},);

export const MessageVisibilityUpdateBody = t.Object({
  visibility: MessageVisibilitySchema,
  reason: t.Optional(t.String(),),
},);

export const MessageStatusUpdateBody = t.Object({
  status: MessageStatusSchema,
},);

export const MessageVariantBody = t.Object({
  variantIndex: t.Numeric({ minimum: 0, },),
},);

export const MessageIdParams = t.Object({
  id: Id,
},);

export const MessagesQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 20, },),),
  parentId: t.Optional(t.String(),),
},);

export const MessageSearchQuery = t.Object({
  /** Scope to a single chat (optional; otherwise searches across all accessible chats). */
  chatId: t.Optional(t.String({ format: "uuid", },),),
  /** Full-text MATCH query against message content (optional — omit for filter-only searches). */
  q: t.Optional(t.String({ maxLength: 500, },),),
  /** Restrict to a sender role. */
  role: t.Optional(t.String({ enum: ["user", "assistant", "character", "system",], },),),
  /** "true" to return only messages that carry at least one attachment. */
  hasAttachment: t.Optional(t.String({ enum: ["true", "false",], },),),
  /** Inclusive lower bound (ISO date) on message created_at. */
  dateFrom: t.Optional(t.String(),),
  /** Inclusive upper bound (ISO date) on message created_at. */
  dateTo: t.Optional(t.String(),),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 50, },),),
  offset: t.Optional(t.Numeric({ minimum: 0, default: 0, },),),
},);

export const MessageAttachmentSchema = t.Object({
  assetId: t.String(),
  order: t.Optional(t.Numeric(),),
  caption: t.Optional(t.String(),),
  label: t.Optional(t.String(),),
},);

export const MessageSearchResult = t.Object({
  messageId: t.String(),
  chatId: t.String(),
  chatName: t.Nullable(t.String(),),
  chatCharacterName: t.Nullable(t.String(),),
  role: MessageRoleSchema,
  content: t.String(),
  /** Snippet around the match; spans the match with <mark> markers when q is given. */
  matchContext: t.String(),
  createdAt: t.String(),
  attachments: t.Optional(t.Array(MessageAttachmentSchema,),),
  /** FTS relevance score (bm25 — lower is more relevant); 0 for filter-only searches. */
  matchScore: t.Number(),
},);

export const MessageSearchResponse = t.Object({
  results: t.Array(MessageSearchResult,),
  total: t.Number(),
  hasMore: t.Boolean(),
  query: t.String(),
},);
