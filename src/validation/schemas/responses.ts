// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared API response-shape schemas (raw TypeBox).
 *
 * These describe the JSON envelopes the server returns and the frontend trusts.
 * They import ONLY `@sinclair/typebox` (not Elysia) so they are:
 *   - browser-bundleable (no node/elysia deps) for frontend `parseOr`,
 *   - valid in Elysia `response:` hooks for server-side enforcement.
 *
 * `parseOr` uses `Static<typeof X>` as the decode target, so the inferred type
 * is the contract both sides agree on.
 */

import { Type, type Static, type TSchema, } from "@sinclair/typebox";

// ── Envelopes ────────────────────────────────────────────────────────────

/** `jsonPaginated(...)` body — `{ data, pagination: { total, page, pageSize, totalPages } }`. */
export const PaginatedEnvelope = <T extends TSchema,>(item: T,) =>
  Type.Object({
    data: Type.Array(item,),
    pagination: Type.Object({
      total: Type.Number(),
      page: Type.Number(),
      pageSize: Type.Number(),
      totalPages: Type.Number(),
    },),
  },);

/** `jsonResponse({ data })` body — a single `data` field. */
export const DataEnvelope = <T extends TSchema,>(item: T,) =>
  Type.Object({ data: item, },);

/** Standard error body. */
export const ErrorBody = Type.Object({
  error: Type.String(),
  code: Type.Optional(Type.String(),),
  details: Type.Optional(Type.Unknown(),),
},);

// ── Message list ─────────────────────────────────────────────────────────

/** One message attachment as serialized by GET /api/chats/:id/messages. */
export const MessageAttachment = Type.Object({
  assetId: Type.String(),
  order: Type.Number(),
  caption: Type.String(),
  label: Type.String(),
  url: Type.String(),
  thumbUrl: Type.Optional(Type.Union([Type.String(), Type.Null(),]),),
  filename: Type.String(),
  mimeType: Type.String(),
  type: Type.String(),
  sizeBytes: Type.Optional(Type.Union([Type.Number(), Type.Null(),]),),
  width: Type.Number(),
  height: Type.Number(),
},);
export type MessageAttachment = Static<typeof MessageAttachment>;

/**
 * One message row as serialized by GET /api/chats/:id/messages.
 * Required fields are DB notNull columns the frontend chat panel reads
 * unconditionally; auxiliary columns stay optional so payloads with extra or
 * null-ed fields still decode (a shape-guard, not a strict DTO).
 * Note: the frontend `Message` interface historically used camelCase
 * `variantIndex`/`totalVariants`; the wire actually emits snake_case
 * `swipe_index`/`continuation_index` — this schema records the wire truth.
 */
export const MessageRow = Type.Object({
  id: Type.String(),
  role: Type.String(),
  content: Type.String(),
  created_at: Type.String(),
  edited_at: Type.Optional(Type.Union([Type.String(), Type.Null(),]),),
  thinking: Type.Optional(Type.Union([Type.String(), Type.Null(),]),),
  actor_name: Type.Optional(Type.Union([Type.String(), Type.Null(),]),),
  swipe_index: Type.Optional(Type.Union([Type.Number(), Type.Null(),]),),
  continuation_index: Type.Optional(Type.Union([Type.Number(), Type.Null(),]),),
  attachments: Type.Optional(Type.Union([Type.Array(MessageAttachment,), Type.Null(),]),),
  model_id: Type.Optional(Type.Union([Type.String(), Type.Null(),]),),
  provider: Type.Optional(Type.Union([Type.String(), Type.Null(),]),),
  token_count_prompt: Type.Optional(Type.Union([Type.Number(), Type.Null(),]),),
  token_count_completion: Type.Optional(Type.Union([Type.Number(), Type.Null(),]),),
  token_count_total: Type.Optional(Type.Union([Type.Number(), Type.Null(),]),),
  generation_time_ms: Type.Optional(Type.Union([Type.Number(), Type.Null(),]),),
  tokens_per_second: Type.Optional(Type.Union([Type.Number(), Type.Null(),]),),
  status: Type.Optional(Type.Union([Type.String(), Type.Null(),]),),
  emotion: Type.Optional(Type.Union([Type.String(), Type.Null(),]),),
  pinned: Type.Optional(Type.Boolean(),),
  section_id: Type.Optional(Type.Union([Type.String(), Type.Null(),]),),
},);

/** Body of GET /api/chats/:id/messages. */
export const MessageListResponse = PaginatedEnvelope(MessageRow,);
export type MessageListResponse = Static<typeof MessageListResponse>;

/** Minimal chat row for the sidebar (GET /api/chats). */
export const ChatRow = Type.Object({
  id: Type.String(),
  name: Type.Optional(Type.String(),),
  isPinned: Type.Optional(Type.Number(),),
  type: Type.Optional(Type.String(),),
  mode: Type.Optional(Type.String(),),
},);
export const ChatListResponse = PaginatedEnvelope(ChatRow,);
export type ChatListResponse = Static<typeof ChatListResponse>;

/** One chat-section row (chat-sections.ts). */
export const ChatSectionRow = Type.Object({
  id: Type.String(),
  name: Type.String(),
},);
export const ChatSectionListResponse = DataEnvelope(Type.Array(ChatSectionRow,),);
export type ChatSectionListResponse = Static<typeof ChatSectionListResponse>;

/** One chat-background row (chat-backgrounds.ts). */
export const ChatBackgroundRow = Type.Object({
  id: Type.String(),
  name: Type.Optional(Type.String(),),
},);
export const ChatBackgroundListResponse = DataEnvelope(Type.Array(ChatBackgroundRow,),);
export type ChatBackgroundListResponse = Static<typeof ChatBackgroundListResponse>;

/** Location rows nested under `data.locations` (chat-location.ts). */
export const ChatLocationRow = Type.Object({
  id: Type.String(),
  name: Type.String(),
},);
export const ChatLocationListResponse = DataEnvelope(
  Type.Object({ locations: Type.Array(ChatLocationRow,), },),
);
export type ChatLocationListResponse = Static<typeof ChatLocationListResponse>;

// ── Notifications & activity (SSE payloads) ────────────────────────────

/** One notification row in the SSE `notifications` event. */
export const NotificationListItem = Type.Object({
  id: Type.String(),
  type: Type.String(),
  title: Type.String(),
  body: Type.Union([Type.String(), Type.Null(),]),
  link: Type.Union([Type.String(), Type.Null(),]),
  read: Type.Number(),
},);
export type NotificationListItem = Static<typeof NotificationListItem>;

/** Body of the SSE `notifications` event. */
export const NotificationsEvent = Type.Object({
  unreadCount: Type.Number(),
  items: Type.Array(NotificationListItem,),
},);
export type NotificationsEvent = Static<typeof NotificationsEvent>;

/** Body of the SSE `stream-error` event (generation/notification streams). */
export const ErrorEvent = Type.Object({
  error: Type.Optional(Type.String(),),
},);
export type ErrorEvent = Static<typeof ErrorEvent>;

/** Body of GET /api/notifications?unread=true — items only. */
export const NotificationsRefresh = Type.Object({
  items: Type.Array(NotificationListItem,),
},);
export type NotificationsRefresh = Static<typeof NotificationsRefresh>;

/** One per-chat activity entry in the SSE `activity` event. */
export const ActivityEntry = Type.Object({
  unseenCount: Type.Number(),
  lastMessageCreatedAt: Type.Union([Type.String(), Type.Null(),]),
  chatName: Type.String(),
},);
export type ActivityEntry = Static<typeof ActivityEntry>;

/** Body of the SSE `activity` event / GET /api/activity snapshot. */
export const ActivitySnapshot = Type.Object({
  chats: Type.Record(Type.String(), ActivityEntry,),
},);
export type ActivitySnapshot = Static<typeof ActivitySnapshot>;

// ── Translation map (i18n) ──────────────────────────────────────────────

/**
 * The nested i18n map resolved by the frontend `t()` helper — a recursive
 * string-or-sub-map. Mirrors the frontend `TranslationMap` interface in
 * `src/frontend/i18n.ts`.
 */
export const TranslationMapSchema: TSchema = Type.Recursive(
  (Self,) =>
    Type.Object({}, {
      additionalProperties: Type.Union([Type.String(), Self,],),
    },),
);
export type TranslationMapSchema = Static<typeof TranslationMapSchema>;

// ── Admin list rows ─────────────────────────────────────────────────────
// Admin response schemas live in `./responses-admin` to keep this module
// under the 250-line ceiling.
export * from "./responses-admin";
