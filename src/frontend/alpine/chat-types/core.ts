// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { DraftStore, } from "../chat-drafts";
import type { AlpineMagicThis, GalleryAsset, QuickReplyButton, } from "../types";
import type { ChatCoreChatListActions, } from "./chat-list-actions";
import type { ChatRow, } from "./chat-row";
import type * as filterState from "./filter-state";
import type { ChatCoreGenerationState, } from "./generation-state";
import type { ChatCoreGmSettingsState, } from "./gm-settings";
import type { GroupedMessage, Message, } from "./messages";
import type { ChatCoreSeenState, } from "./seen-state";
import type * as uiState from "./ui-state";
import type { ChatCoreVnSettingsState, } from "./vn-settings";
import type { ChatWorldChannelsState, } from "./world-channels";
export type { ChatCoreChatListActions, } from "./chat-list-actions";
export type { ChatRow, } from "./chat-row";
export type { ChatCoreFilterState, } from "./filter-state";
export type { ChatCoreGenerationState, } from "./generation-state";
export type { ChatCoreGmSettingsState, } from "./gm-settings";
export type { ChatCoreSeenState, SeenStateRow, } from "./seen-state";
export type { ChatCoreUiState, } from "./ui-state";
export type { ChatCoreVnSettingsState, } from "./vn-settings";
/** Chat page core state and methods (messages, lists, editing, VN, filters). */
export interface ChatCoreState
  extends
    AlpineMagicThis,
    ChatWorldChannelsState,
    filterState.ChatCoreFilterState,
    uiState.ChatCoreUiState,
    ChatCoreChatListActions,
    ChatCoreGenerationState,
    ChatCoreGmSettingsState,
    ChatCoreSeenState,
    ChatCoreVnSettingsState
{
  isGenerating: boolean;
  generationLabel: string;
  activeAttemptId: string | null;
  continuingMessageId: string | null;
  isContinuing: boolean;
  chats: {
    id: string;
    name?: string;
    isPinned?: boolean | number;
    type?: string;
    mode?: string;
    encryption_level?: string;
    turn_strategy?: string;
    story_state?: string;
    gm_config?: string;
    thinking_visibility?: string;
    prompt_override?: string | null;
    quick_replies?: string | null;
    custom_instructions?: string | null;
  }[];
  activeChat: string | null;
  messages: Message[];
  loadingMessages: boolean;
  loadingError: string | null;
  hasMoreMessages: boolean;
  loadingOlder: boolean;
  currentPage: number;
  totalPages: number;
  scrollObserver: IntersectionObserver | null;
  activeChatName: string;
  galleryAssets: GalleryAsset[];
  /** Current gallery page (chat asset sidebar pagination). */
  galleryPage: number;
  /** Total chat-linked assets reported by the assets API. */
  galleryTotal: number;
  userDisplayName: string;
  userRole: string;
  currentCharacter: {
    id: string;
    display_name?: string;
    name?: string;
    description?: string;
    avatar_asset_id?: string;
  } | null;
  detailLevel: "Immersion" | "Basic" | "Detailed";
  impersonationActive: boolean;
  impersonatingActorId: string | null;
  editingMessageId: string | null;
  editContent: string;
  previewMediaAsset: GalleryAsset | null;
  pendingAssets: { assetId: string; filename: string }[];
  groupedMessages: GroupedMessage[];
  _observer: MutationObserver | null;
  _groupedKey: string;
  _groupedCache: GroupedMessage[] | null;
  _toggleChatListHandler: (() => void) | null;
  _toggleGalleryHandler: (() => void) | null;
  _toggleCharacterInfoHandler: (() => void) | null;
  _toggleMemoryPanelHandler: (() => void) | null;
  _openChatSettingsHandler: (() => void) | null;
  _panelClickHandler: ((e: MouseEvent,) => void) | null;
  _keydownHandler: ((e: KeyboardEvent,) => void) | null;
  _chatSettingsName: string;
  _chatSettingsMode: string;
  _chatSettingsTurnStrategy: string;
  _chatSettingsThinkingVisibility: "hidden" | "collapsed" | "visible";
  _chatOnline: boolean;
  _groupPaused: boolean;
  _renameChatId: string;
  _renameChatName: string;
  _personas: any[];
  _selectedPersonaId: string | null;
  _ownershipModalOpen: boolean;
  _ownershipNewOwnerId: string;
  _ownershipReason: string;
  _ownershipSubmitting: boolean;
  _ownershipError: string;
  _impersonatingActorId: string | null;
  _responseLengthPreset: "short" | "medium" | "long" | "custom";
  _responseLengthCustom: number;
  /** Chat-level output-style preset ("" = none). */
  _outputStylePreset:
    | ""
    | "neutral"
    | "high_fantasy"
    | "sci_fi"
    | "modern"
    | "noir"
    | "cyberpunk"
    | "pulp"
    | "literary"
    | "horror"
    | "western";
  /** How strongly the style is imposed (0–1). */
  _outputStyleIntensity: number;
  /** Hidden carriage opt-in (flat TOML episode context). */
  _carriageEnabled: boolean;
  /** Story tier of the two-tier custom instructions ("" = unset). */
  _customInstructions: string;
  /** Auto-translate target lang code ("" = off). */
  _chatAutoTranslateLang: string;
  _quickReplies: QuickReplyButton[];
  _quickRepliesDirty: boolean;
  _startupFiredChat: string | null;
  /** Marks an automated (event-triggered) send so it doesn't re-trigger `user` events. */
  _autoFired: boolean;
  /** Epoch ms of the last automated send; drives the min-interval rate limit. */
  _lastAutoFireAt: number;
  /** Consecutive automated sends since the last human-initiated send; capped to break loops. */
  _consecutiveAutoFires: number;
  _draftTimer: ReturnType<typeof setTimeout> | null;
  /** Last non-empty draft before clear — session-level Ctrl+Z undo. */
  _draftBackup: string | undefined;
  loadQuickReplies(): void;
  executeQuickReply(command: string,): Promise<void>;
  fireStartupQuickReplies(): Promise<void>;
  fireAutoQuickReplies(trigger: "user" | "ai",): Promise<void>;
  saveQuickReplies(): Promise<void>;
  // Proactive messaging scheduler (chat-proactive.ts) — polls for due messages.
  /** Guard: a selectChat() run is in flight — ignore overlapping calls. */
  _selectingChat: boolean;
  _proactiveTimer: ReturnType<typeof setInterval> | null;
  _proactiveInFlight: boolean;
  _proactiveLastSendAt: number;
  startProactiveScheduler(): void;
  stopProactiveScheduler(): void;
  tickProactive(): Promise<void>;
  _chatKey: CryptoKey | null;
  _encryptionEnabled: boolean;
  _keyId: string | null;
  /** Tier of the active chat (from the list row); gates the key fetch. */
  _activeChatEncryptionLevel: string | null;
  init(): void;
  destroy(): void;
  loadUserInfo(): Promise<void>;
  loadChats(): Promise<void>;
  /** Internal selectChat body — split out for the reentrancy guard. */
  _selectChatInner(chatId: string,): Promise<void>;
  selectChat(chatId: string,): Promise<void>;
  loadChatKey(chatId: string, encryptionLevel?: string | null,): Promise<void>;
  loadMessages(): Promise<void>;
  loadOlderMessages(): Promise<void>;
  setupInfiniteScroll(): void;
  sendMessage(): Promise<void>;
  interceptSlashSend(text: string, input: HTMLTextAreaElement,): Promise<boolean>;
  saveComposerDraft(store?: DraftStore,): void;
  flushComposerDraft(store?: DraftStore,): void;
  restoreComposerDraft(store?: DraftStore,): void;
  clearComposerDraft(store?: DraftStore,): void;
  autoResize(el: HTMLTextAreaElement,): void;
  scrollToBottom(): void;
  setupScrollDetection(): void;
  scrollToBottomSmooth(): void;
  loadGalleryAssets(): Promise<void>;
  loadMoreGalleryAssets(): Promise<void>;
  deletePreviewAsset(): Promise<void>;
  uploadChatAssets(event: Event,): Promise<void>;
  loadCharacterInfo(): Promise<void>;
  formatTime(iso: string,): string;
  formatTimeShort(iso: string,): string;
  formatDate(iso: string,): string;
  displayName(msg: { role: string; actor_name?: string },): string;
  copyMessage(msgId: string, event: Event,): Promise<void>;
  removeMessage(msgId: string, event: Event,): Promise<void>;
  toggleImpersonate(): Promise<void>;
  impersonate(cmd: string,): Promise<void>;
  toggleDebugView(): void;
  handleCommandInput(event: Event,): void;
  selectCommand(name: string,): void;
  dispatchCommandAction(action: string, payload: Record<string, unknown> | null, chatId: string,): Promise<void>;
  loadImpersonationState(): Promise<void>;
  loadChatParticipants(): Promise<void>;
  toggleImpersonation(): Promise<void>;
  generateImageFromMessage(msgId: string,): Promise<void>;
  captionMessage(msgId: string,): Promise<void>;
  forwardMessage(msgId: string,): Promise<void>;
  runMessageAiAction(msgId: string, action: "summarize" | "action-items" | "explain",): Promise<void>;
  statsLine(msg: {
    model_id?: string;
    provider?: string;
    generation_time_ms?: number;
    token_count_total?: number;
    tokens_per_second?: number;
  },): string;
  formattedGenerationTime(ms?: number,): string;
  formattedTokensPerSecond(msg: {
    tokens_per_second?: number;
    generation_time_ms?: number;
    token_count_total?: number;
  },): string;
  markChatAsRead(chatId: string,): Promise<void>;
  getUnseenCount(chatId: string,): number;
  getChatId(): string | null;
  handleAttach(event: Event,): Promise<void>;
  escapeHtml(str: string,): string;
  startEdit(msgId: string,): void;
  cancelEdit(): void;
  saveEdit(msgId: string,): Promise<void>;
  renderMarkdown(content: string,): string;
  getMediaStyle(asset: any, totalCount: number,): Record<string, string>;
  openMediaPreview(asset: any,): void;
  removePendingAsset(assetId: string,): void;
  openAssetPreview(asset: { id: string; asset_type?: string; filename?: string; name?: string },): void;
  openChatSettings(): Promise<void>;
  updateVnMode(): void;
  saveChatSettings(): Promise<void>;
  isChatPaused(chat: any,): boolean;
  readonly currentChat: ChatRow | null;
  loadChatKey(chatId: string, encryptionLevel?: string | null,): Promise<void>;
  checkGenerationStatus(chatId: string,): Promise<void>;
  registerPanelHandlers(): void;
  unregisterPanelHandlers(): void;
}
