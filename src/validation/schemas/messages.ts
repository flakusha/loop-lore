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

/**
 * One enriched attachment on a message item — mirrors the object
 * enrichAttachments() builds in src/routes/messages/helpers.ts. All fields
 * are always present; absence of attachments is expressed as a list-level
 * null, never as an undefined field.
 */
export const MessageAttachmentSchema = t.Object({
  assetId: t.String(),
  order: t.Number(),
  caption: t.String(),
  label: t.String(),
  url: t.String(),
  thumbUrl: t.String(),
  filename: t.String(),
  mimeType: t.String(),
  type: t.String(),
  sizeBytes: t.Number(),
  durationSecs: t.Number(),
  width: t.Number(),
  height: t.Number(),
  nsfw: t.Boolean(),
},);

/**
 * Enriched message item in the GET /chats/:id/messages list. Declares the
 * fields the route guarantees; per-row extras (variant info, avatar bundle,
 * read-time translations) are additive and intentionally not closed.
 * attachments/tool_calls are null when absent — never undefined.
 */
export const MessageListItemSchema = t.Object({
  id: Id,
  chat_id: Id,
  role: MessageRoleSchema,
  content: t.String({ description: "Render-time plaintext content (transformed, or the decrypt-failure placeholder).", },),
  attachments: t.Union([t.Array(MessageAttachmentSchema,), t.Null(),], { description: "Resolved attachment assets, or null when the message carries none.", },),
  tool_calls: t.Union([t.Array(t.Any(),), t.Null(),], { description: "Persisted assistant tool calls, or null when none.", },),
  tool_name: t.Union([t.String(), t.Null(),],),
  tool_error: t.Boolean(),
  created_at: t.String(),
},);

/**
 * Variant sibling in the GET /messages/:id/variants array: the RAW message
 * row plus render-time plaintext content. Unlike the list/single-message
 * contract, attachments and tool_calls here are the STORED JSON strings
 * (no enrichment runs on this path).
 */
export const MessageVariantItemSchema = t.Object({
  id: Id,
  chat_id: Id,
  parent_id: t.Union([Id, t.Null(),],),
  role: MessageRoleSchema,
  content: t.String({ description: "Message content text: render-transformed on /variants, stored content on /variant select.", },),
  content_type: MessageContentTypeSchema,
  status: MessageStatusSchema,
  visibility: MessageVisibilitySchema,
  attachments: t.Union([t.String(), t.Null(),], { description: "Stored attachment JSON string (raw, unenriched on this route), or null.", },),
  tool_calls: t.Union([t.String(), t.Null(),], { description: "Stored tool-call JSON string (raw), or null.", },),
  swipe_index: t.Union([t.Number(), t.Null(),],),
  created_at: t.String(),
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
