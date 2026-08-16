// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Service Layer barrel.
 *
 * Re-exports the public surface of the split chat service modules.
 * Routes, generation, and the chat module index import from `../chat/service`;
 * this barrel keeps that import path stable.
 *
 * Business logic between routes and database. Routes call these functions;
 * these modules call Kysely. No HTTP concerns — no Request/Response, no
 * Elysia context. Errors are thrown as ServiceError objects; routes map to HTTP.
 *
 * Removed 2026-08-14 (dead — routes implement inline, no external consumers):
 * participants.ts (addParticipant, markChatRead, removeParticipant,
 *   updateChatLocation, updateParticipant, updateUserPersona),
 * context.ts (getChatContext, getFeatureFlags, getResponseLength),
 * write.ts (selectVariant, deleteMessage, editMessage),
 * visibility.ts (updateMessageStatus),
 * access.ts barrel (isChatOnline, KEY_MECHANIC_PARAMS, KeyMechanicParam —
 *   still used internally by crud/update.ts, not exported).
 */

// ── Access ────────────────────────────────────────────────────
export { checkChatAccess, } from "./access";

// ── Chat CRUD ─────────────────────────────────────────────────
export {
  batchArchiveChats,
  batchDeleteChats,
  batchExportChats,
  createChat,
  deleteChat,
  getChat,
  updateChat,
} from "./chats";
export { updateGmGuidance, } from "./crud";

// ── Chat setup templates ──────────────────────────────────────
export {
  CHAT_SETUP_TEMPLATE_DEFAULTS,
  createChatSetupTemplate,
  deleteChatSetupTemplate,
  getChatSetupTemplate,
  listChatSetupTemplates,
  seedChatSetupTemplates,
  updateChatSetupTemplate,
} from "./templates";

// ── Transitions ───────────────────────────────────────────────
export { migrateChat, } from "./transitions";

// ── Turn order (C1 — group-chat turn-order indicator) ────────
export { resolveGroupTurnOrder, } from "./turn-order";
export type { GroupTurnOrder, TurnOrderSlot, } from "./turn-order";

// ── Participants ──────────────────────────────────────────────
export { updateImpersonation, } from "./participants";

// ── Messages ──────────────────────────────────────────────────
export {
  getMessageVariants,
  getMessageWithAccess,
  listMessages,
} from "./read";
export { regenerateMessageVariant, } from "./write";

// ── Message visibility ────────────────────────────────────────
export { updateMessageVisibility, } from "./visibility";

// ── Location events ───────────────────────────────────────────
export { getLocationHistory, recordLocationChange, } from "./location-events";

// ── Shared schema + error/result types ────────────────────────
export type {
  ChatSetupTemplate,
  CreateChatParams,
  KeyMechanicConflictError,
  ListMessagesParams,
  MigrateChatParams,
  MigrateChatResult,
  RegenerateVariantParams,
  RegenerateVariantResult,
  ServiceError,
  TemplateMutationResult,
  UpdateChatParams,
  UpdateChatResult,
} from "./types";
