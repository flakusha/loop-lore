/**
 * Chat Service Layer barrel.
 *
 * Re-exports the full public surface of the split chat service modules.
 * Routes, generation, and the chat module index import from `../chat/service`;
 * this barrel keeps that import path stable.
 *
 * Business logic between routes and database. Routes call these functions;
 * these modules call Kysely. No HTTP concerns — no Request/Response, no
 * Elysia context. Errors are thrown as ServiceError objects; routes map to HTTP.
 */

// ── Access / online state ─────────────────────────────────────
export {
  checkChatAccess,
  isChatOnline,
  KEY_MECHANIC_PARAMS,
} from "./access";
export type { KeyMechanicParam, } from "./access";

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

// ── Chat participants ─────────────────────────────────────────
export {
  addParticipant,
  markChatRead,
  removeParticipant,
  updateChatLocation,
  updateImpersonation,
  updateParticipant,
  updateUserPersona,
} from "./participants";

// ── Messages ──────────────────────────────────────────────────
export {
  deleteMessage,
  editMessage,
  getMessageVariants,
  getMessageWithAccess,
  listMessages,
  regenerateMessageVariant,
  selectVariant,
} from "./messages";

// ── Message visibility / status ───────────────────────────────
export { updateMessageStatus, updateMessageVisibility, } from "./visibility";

// ── Read-only chat config ─────────────────────────────────────
export { getChatContext, getFeatureFlags, getResponseLength, } from "./context";

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
