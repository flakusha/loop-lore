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

export const MessageForwardBody = t.Object({
  targetChatId: t.String({ minLength: 1, },),
  idempotencyKey: t.Optional(t.String(),),
},);

export const MessageAiActionBody = t.Object({
  action: t.Union([
    t.Literal("summarize",),
    t.Literal("action-items",),
    t.Literal("explain",),
    t.Literal("translate",),
  ],),
  /**
   * BCP-47 target language for the `translate` action (e.g. "es",
   * "pt-BR"). Required only for translate; ignored otherwise.
   */
  language: t.Optional(t.String({ minLength: 2, maxLength: 35, },),),
},);

export const MessageVisibilityUpdateBody = t.Object({
  visibility: MessageVisibilitySchema,
  reason: t.Optional(t.String(),),
},);

export const MessageStatusUpdateBody = t.Object({
  status: MessageStatusSchema,
},);

// BUG-chat-minors-variant-put-never-persists: variant selection is a
// stateless read — no persisted "selected variant" column exists, so the
// endpoint is a GET with the index as a query param, not a PUT body.
export const MessageVariantQuery = t.Object({
  variantIndex: t.Numeric({ minimum: 0, },),
},);

// Message translations (FEAT-message-translations-chat-first): the locale
// is validated against the shared catalog at runtime (normalizeTargetLang)
// so the schema stays a plain string and unknown codes hit the same 400
// path as the auto-translate endpoint.
export const MessageTranslationLocaleParams = t.Object({
  id: Id,
  locale: t.String({ minLength: 1, maxLength: 16, },),
},);

export const MessageTranslationBody = t.Object({
  locale: t.String({ minLength: 1, maxLength: 16, },),
},);

export const MessageIdParams = t.Object({
  id: Id,
},);

export const MessagesQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 20, },),),
  parentId: t.Optional(t.String(),),
  /** Opt-in read-time translation negotiation (locale or "auto"). */
  translateLocale: t.Optional(t.String({ minLength: 1, maxLength: 35, },),),
},);

export const MusicLinkMessageSchema = t.Object({
  id: t.String(),
  chatId: t.String(),
  service: t.String(),
  url: t.String(),
  embedHtml: t.Nullable(t.String()),
  title: t.String(),
  artist: t.String(),
  thumbnailUrl: t.Nullable(t.String()),
  durationSecs: t.Nullable(t.Number()),
  serviceTrackId: t.String(),
  serviceUrl: t.String(),
  isPlaylist: t.Boolean(),
  trackCount: t.Nullable(t.Number()),
  explicit: t.Boolean(),
  nsfwHidden: t.Boolean(),
  createdAt: t.String(),
},);
