// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Service Layer barrel.
 *
 * Re-exports the public surface of all chat service modules. Routes,
 * generation, and the chat module index import from `../chat/service`;
 * this barrel keeps that import path stable.
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

// ── Party join/leave (C7 — group-chat VN party) ──────────────
export {
  joinParty,
  leaveParty,
  type PartyJoinParams,
  type PartyJoinResult,
  type PartyLeaveParams,
  type PartyLeaveResult,
} from "./party";

// ── Party split / reunion (C7 Phase 3) ─────────────────────────
export {
  reuniteChats,
  type ReunitePartyParams,
  type ReunitePartyResult,
  type SplitBranch,
  splitParty,
  type SplitPartyParams,
  type SplitPartyResult,
} from "./split";

// ── Messages ──────────────────────────────────────────────────
export {
  getMessageVariants,
  getMessageWithAccess,
  listMessages,
} from "./read";
export { regenerateMessageVariant, } from "./write";

// ── Message visibility ────────────────────────────────────────
export { updateMessageVisibility, } from "./visibility";

// ── Message seen-state (VN mode / AI processing) ─────────────
export {
  deleteMessageSeen,
  getMessageSeen,
  recordMessageSeen,
  type SeenStateRecord,
} from "./seen";

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
