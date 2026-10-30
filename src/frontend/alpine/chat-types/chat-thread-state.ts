// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { GalleryAsset, } from "../types";
import type { GroupedMessage, Message, } from "./messages";

/** Chat identity, list, thread-loading, gallery, and message-editing state. */
export interface ChatCoreChatThreadState {
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
    world_id?: string;
    prompt_override?: string | null;
    quick_replies?: string | null;
    custom_instructions?: string | null;
    /** Owner (creator) user id — gates owner-only affordances. */
    created_by?: string;
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
  _personas: { id: string; name?: string }[];
  _selectedPersonaId: string | null;
  _impersonatingActorId: string | null;
}
