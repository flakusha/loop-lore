// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { AlpineMagicThis, } from "../types";
import type { ChatCoreChatListActions, } from "./chat-list-actions";
import type { ChatRow, } from "./chat-row";
import type { ChatCoreChatThreadState, } from "./chat-thread-state";
import type { ChatCoreClassifierState, } from "./classifier-state";
import type { ChatCoreComposerState, } from "./composer-state";
import type { ChatCoreEncryptionState, } from "./encryption-state";
import type * as filterState from "./filter-state";
import type { ChatCoreGenerationState, } from "./generation-state";
import type { ChatCoreGmSettingsState, } from "./gm-settings";
import type { ChatCoreOutputStyleState, } from "./output-style-state";
import type { ChatCoreOwnersState, } from "./owners-state";
import type { ChatCoreProactiveState, } from "./proactive-state";
import type { ChatCoreQuickRepliesState, } from "./quick-replies-state";
import type { ChatCoreSeenState, } from "./seen-state";
import type * as uiState from "./ui-state";
import type { ChatCoreVnSettingsState, } from "./vn-settings";
import type { ChatWorldChannelsState, } from "./world-channels";
export type { ChatCoreChatListActions, } from "./chat-list-actions";
export type { ChatRow, } from "./chat-row";
export type { ChatCoreChatThreadState, } from "./chat-thread-state";
export type { ChatCoreClassifierState, } from "./classifier-state";
export type { ChatCoreComposerState, } from "./composer-state";
export type { ChatCoreEncryptionState, } from "./encryption-state";
export type { ChatCoreFilterState, } from "./filter-state";
export type { ChatCoreGenerationState, } from "./generation-state";
export type { ChatCoreGmSettingsState, } from "./gm-settings";
export type { ChatCoreOutputStyleState, } from "./output-style-state";
export type { ChatCoreOwnersState, } from "./owners-state";
export type { ChatCoreProactiveState, } from "./proactive-state";
export type { ChatCoreQuickRepliesState, } from "./quick-replies-state";
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
    ChatCoreChatThreadState,
    ChatCoreClassifierState,
    ChatCoreComposerState,
    ChatCoreEncryptionState,
    ChatCoreGenerationState,
    ChatCoreGmSettingsState,
    ChatCoreOutputStyleState,
    ChatCoreOwnersState,
    ChatCoreProactiveState,
    ChatCoreQuickRepliesState,
    ChatCoreSeenState,
    ChatCoreVnSettingsState
{
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
  runMessageAiAction(
    msgId: string,
    action: "summarize" | "action-items" | "explain" | "translate",
    language?: string,
  ): Promise<void>;
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
  checkGenerationStatus(chatId: string,): Promise<void>;
  registerPanelHandlers(): void;
  unregisterPanelHandlers(): void;
  _startFireAndForgetLoaders(): void;
  _loadChatFromUrl(): Promise<void>;
}
