// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pinned chatState + ui-store contract for E2E Alpine state assertions.
 *
 * Re-exports the canonical interfaces from src/frontend/alpine/ so any
 * structural change (renamed flag, new required field, removed getter)
 * breaks the build at the type layer — before it manifests as an
 * undeclared-template-var hydration bug in chat.html.
 *
 * Co-locates the default-value mirror used by chat-state.browser.ts to
 * verify the live factory produces the declared shape after Alpine init.
 *
 * Acceptance: tests/e2e/flows/browser/chat-state.browser.ts and any
 * state-asserting browser test should `import type { ChatStateShape,
 * UiStoreShape } from "../../fixtures/chat-state-contract"` and use
 * `getAlpineData<ChatStateShape>(...)` / `getAlpineStore<UiStoreShape>(...)`.
 */

// ── Pinned interfaces (interfaces, not type aliases — merging-friendly) ───

import type { ChatState, } from "@/frontend/alpine/chat-types";

/** Pinned shape of the chatState() Alpine component-local state. */
export interface ChatStateShape extends ChatState {}

/**
 * Pinned shape of the `$store.ui` Alpine store.
 *
 * The source-of-truth default-value object is typed as `Record<string,
 * unknown>` for runtime mutability, so the contract fixture derives a
 * structural interface from its keys via a `typeof` snapshot. When
 * `uiStoreDefinition` gains/loses a property, `UiStoreShape` widens/
 * narrows automatically — making drift visible to every state-asserting
 * test that uses `getAlpineStore<UiStoreShape>(...)`.
 */
export interface UiStoreShape {
  showChatList: boolean;
  showGallery: boolean;
  showCharacterInfo: boolean;
  showMemoryPanel: boolean;
  showSectionsPanel: boolean;
  showBackgroundPanel: boolean;
  showLocationPanel: boolean;
  showUploadModal: boolean;
  showImportForm: boolean;
  showCreateForm: boolean;
  showEditModal: boolean;
  showPreviewModal: boolean;
  showChatSettings: boolean;
  showRenameModal: boolean;
  showPersonaForm: boolean;
  hasActiveChat: boolean;
  userRole: string;
  showGmPanel: boolean;
  showParticipants: boolean;
  showGmGuidance: boolean;
  showQuestLog: boolean;
  showSideChannels: boolean;
  gmAssistantTab: string;
  sideChannels: Array<{
    id: string;
    name: string;
    type: string;
    mode: string;
    created_by: string;
    world_id: string | null;
    created_at: string;
    updated_at: string;
  }>;
  newSideChannelName: string;
  activePersona: unknown;
}

// ── Runtime default-value mirror ──────────────────────────────────────────

/**
 * Mirror of `uiStoreDefinition` defaults declared in src/frontend/stores/
 * ui-store.ts. If a default changes upstream, this object changes too and
 * `chat-state.browser.ts` flags it via the pinned UiStoreShape. Use only
 * for asserting cold-load defaults, not for runtime mutation.
 */
export const UI_STORE_DEFAULTS: UiStoreShape = {
  // Sidebar / panels
  showChatList: false,
  showGallery: false,
  showCharacterInfo: false,
  showMemoryPanel: false,
  showSectionsPanel: false,
  showBackgroundPanel: false,
  showLocationPanel: false,
  // Modals
  showUploadModal: false,
  showImportForm: false,
  showCreateForm: false,
  showEditModal: false,
  showPreviewModal: false,
  showChatSettings: false,
  showRenameModal: false,
  showPersonaForm: false,
  // State flags
  hasActiveChat: false,
  userRole: "member",
  showGmPanel: false,
  showParticipants: false,
  showGmGuidance: false,
  showQuestLog: false,
  showSideChannels: false,
  // Unified GM & Assistant panel — active tab
  gmAssistantTab: "shadow",
  // Side-channels
  sideChannels: [],
  newSideChannelName: "",
  // Active entity refs
  activePersona: null,
};

// ── Chat-state defaults (cold load, pre-chat) ──────────────────────────────

/**
 * Cold-load defaults for chatState() — pre-chat, post-Alpine-init, as
 * declared in src/frontend/alpine/chat/bootstrap.ts. Mirrored here so a
 * drifted default surfaces as a chat-state.browser.ts failure, not a
 * silent hydration mismatch in chat.html.
 *
 * `t()` calls in the factory return localized strings at runtime, so
 * `activeChatName` / `generationLabel` / `userDisplayName` are asserted
 * by *type* (string) rather than literal value. The structural shape is
 * what we pin.
 *
 * NOTE: `showRpgPanel` is set directly in bootstrap.ts after spreading
 * `rpgStats`; it is NOT part of the `ChatState` interface, so it is
 * excluded from this Pick to avoid a type error.
 */
export const CHAT_STATE_DEFAULTS: Pick<
  ChatStateShape,
  | "isGenerating"
  | "isContinuing"
  | "activeAttemptId"
  | "continuingMessageId"
  | "_streamToolCalls"
  | "_streamContent"
  | "chats"
  | "activeChat"
  | "messages"
  | "loadingMessages"
  | "loadingError"
  | "hasMoreMessages"
  | "loadingOlder"
  | "currentPage"
  | "totalPages"
  | "scrollObserver"
  | "detailLevel"
  | "impersonationActive"
  | "impersonatingActorId"
  | "_hamburgerOpen"
  | "_statsOpen"
  | "_impersonationLoaded"
  | "_unseenCounts"
  | "_chatFilter"
  | "_searchResults"
  | "_worlds"
  | "_worldChats"
  | "_worldExpanded"
  | "_worldsLoading"
  | "worldJoinCode"
  | "_joinableChats"
  | "currentCharacter"
  | "generationDetail"
  | "galleryAssets"
  | "userRole"
> = {
  // Core state
  isGenerating: false,
  isContinuing: false,
  activeAttemptId: null,
  continuingMessageId: null,
  _streamToolCalls: [],
  _streamContent: "",
  chats: [],
  activeChat: null,
  messages: [],
  loadingMessages: false,
  loadingError: null,
  hasMoreMessages: true,
  loadingOlder: false,
  currentPage: 1,
  totalPages: 1,
  scrollObserver: null,
  // Detail
  detailLevel: "Immersion",
  // Impersonation
  impersonationActive: false,
  impersonatingActorId: null,
  // Internal toggles
  _hamburgerOpen: {},
  _statsOpen: {},
  _impersonationLoaded: false,
  _unseenCounts: {},
  _chatFilter: "",
  _searchResults: [],
  // World channels
  _worlds: [],
  _worldChats: {},
  _worldExpanded: {},
  _worldsLoading: false,
  worldJoinCode: "",
  // Joinable discovery
  _joinableChats: [],
  // Character + generation
  currentCharacter: null,
  generationDetail: null,
  galleryAssets: [],
  userRole: "solo",
};

// ── Selector constants ────────────────────────────────────────────────────

/**
 * Selector constants used by state-asserting browser tests. Pinning them
 * in one place means a template-attribute rename only needs updating
 * here — not across every test file.
 */
export const CHAT_SELECTORS = {
  /** Root element carrying `x-data="chatState()"`. */
  chatStateRoot: "[x-data='chatState()']",
  /** Side panel container. */
  chatListPanel: "[data-testid='chat-list-panel']",
  /** Header button that toggles $store.ui.showChatList. */
  toggleChatList: "[data-testid='toggle-chat-list']",
  /** Header button that toggles $store.ui.showGallery. */
  toggleGallery: "[data-testid='toggle-gallery']",
  /** Header button that toggles $store.ui.showCharacterInfo. */
  toggleCharacterInfo: "[data-testid='toggle-character-info']",
  /** Sidebar hamburger. */
  hamburger: "[data-testid='hamburger']",
  /** Sidebar container. */
  sidebar: "[data-testid='sidebar']",
  /** Message list region. */
  messageList: "[data-testid='message-list']",
  /** Message form (input + send). */
  messageForm: "[data-testid='message-form']",
  /** Message input. */
  messageInput: "[data-testid='message-input']",
  /** Send button. */
  sendButton: "[data-testid='send-button']",
  /** Generation status container. */
  generationStatus: "[data-testid='generation-status']",
  /** Cancel generation button. */
  cancelGeneration: "[data-testid='cancel-generation']",
  /** Modal that opens via $store.ui.showChatSettings. */
  chatSettingsModal: "[data-testid='chat-settings-modal']",
  /** Modal title shown via $store.ui.showChatSettings. */
  chatSettingsTitle: "[data-testid='settings-modal-title']",
  /** Sidebar chat-list upload input. */
  galleryUploadInput: "[data-testid='gallery-upload-input']",
} as const;

export type ChatSelector = (typeof CHAT_SELECTORS)[keyof typeof CHAT_SELECTORS];