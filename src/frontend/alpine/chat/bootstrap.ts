// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Chat page (chat.html) — reactive state object builder ────
import { chatActions, } from "../chat-actions";
import { gifPicker, } from "../chat-actions/gif-picker";
import { promptAnalyzeActions, } from "../chat-actions/prompt-analyze";
import { promptImproveActions, } from "../chat-actions/prompt-improve";
import { chatActivity, } from "../chat-activity";
import { chatBackgrounds, } from "../chat-backgrounds";
import { chatBattle, } from "../chat-battle";
import { chatEditing, } from "../chat-editing";
import { chatFilters, } from "../chat-filters";
import { chatGenerations, } from "../chat-generations";
import { chatGroup, } from "../chat-group";
import { chatInvites, } from "../chat-invites";
import { chatKeys, } from "../chat-keys";
import { chatLocation, } from "../chat-location";
import { chatManagement, } from "../chat-management";
import { chatMessages, } from "../chat-messages";
import { type AssistantToolCall, chatPanels, collectAssistantToolCalls, } from "../chat-panels";
import { chatParticipants, } from "../chat-participants";
import { chatPins, } from "../chat-pins";
import { chatProactive, } from "../chat-proactive";
import { chatPromptTemplate, } from "../chat-prompt-template";
import { chatQuickReplies, } from "../chat-quick-replies";
import { chatSections, } from "../chat-sections";
import { chatSectionsNav, } from "../chat-sections-nav";
import { chatSettings, } from "../chat-settings";
import { chatSideChannels, } from "../chat-side-channels";
import { chatUtils, } from "../chat-utils";
import { chatVariants, } from "../chat-variants";
import { attachValidateDraft, createComposerPreSend, } from "../composer-pre-send";
import { creationWizard, } from "../creation-wizard";
import { t, } from "../i18n";
import { memoryPanel, } from "../memory-panel";
import { messageArchive, } from "../message-archive";
import { messageSearch, } from "../message-search";
import { moodState, } from "../mood";
import { rpgStats, } from "../rpg-stats";
import type { AlpineMagicThis, AlpineState, ChatState, WorldChannelChat, } from "../types";
import { worldChannels, } from "../world-channels";
import { chatLifecycle, } from "./lifecycle";
import { chatMusicEmbed, } from "./music-embed";
import { chatSearch, } from "./search";
import { chatWorld, } from "./world";

import { mergeReactiveSource, } from "./merge-reactive";
import { filterChatList, findActiveChat, } from "./selectors";

/**
 * Build the chat page's reactive Alpine state (registry entry = chatState).
 * @returns the Alpine chat state object
 */
export function chatState() {
  const state: Record<string, unknown> & ThisType<ChatState & AlpineMagicThis> = {
    // ── Core state ──
    isGenerating: false,
    generationLabel: t("status.characterResponding",),
    activeAttemptId: null as string | null,
    continuingMessageId: null as string | null,
    isContinuing: false,
    _generationEventSource: null as EventSource | null,
    _streamToolCalls: [] as string[],
    _streamContent: "",
    chats: [] as { id: string; name?: string; thinking_visibility?: string }[],
    activeChat: null as string | null,
    messages: [] as {
      id: string;
      role: string;
      content: string;
      created_at: string;
      thinking?: string;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] | null;
      actor_name?: string;
      totalVariants?: number;
      variantIndex?: number;
      attachments?: {
        assetId: string;
        order: number;
        caption: string;
        label: string;
        url: string;
        thumbUrl?: string;
        filename: string;
        mimeType: string;
        type: string;
        width: number;
        height: number;
        durationSecs?: number;
      }[];
    }[],
    loadingMessages: false,
    loadingError: null as string | null,
    hasMoreMessages: true,
    loadingOlder: false,
    currentPage: 1,
    totalPages: 1,
    scrollObserver: null as IntersectionObserver | null,
    activeChatName: t("chats.welcomeTitle",),
    galleryAssets: [] as {
      id: string;
      name?: string;
      filename?: string;
      asset_type?: string;
      mime_type?: string;
      size_bytes?: number;
      width?: number;
      height?: number;
      alt_text?: string;
    }[],
    galleryPage: 1,
    galleryTotal: 0,
    userDisplayName: t("common.user",),
    userRole: "solo",
    currentCharacter: null as {
      id: string;
      display_name?: string;
      name?: string;
      description?: string;
      avatar_asset_id?: string;
    } | null,
    generationDetail: null as {
      model?: string;
      elapsedMs?: number;
      chunksReceived?: number;
      charsReceived?: number;
      status?: string;
      attemptId?: string;
    } | null,
    detailLevel: "Immersion",
    /**
     * Per-chat thinking visibility: hidden | collapsed | visible
     * @returns the active chat's thinking visibility, default hidden
     */
    get thinkingVisibility(): string {
      const chat = this.chats.find((c: { id: string; thinking_visibility?: string },) => c.id === this.activeChat);
      return chat?.thinking_visibility ?? "hidden";
    },
    impersonationActive: false,
    impersonatingActorId: null as string | null,
    _hamburgerOpen: {},
    _statsOpen: {},
    _impersonationLoaded: false,
    _unseenCounts: {},
    _chatFilter: "",
    // ── Seen-state popover defaults — chat-seen.initSeenPopover() only sets
    // these inside the `show-seen-popover` listener (chat-seen.ts:80-88), so
    // without these initial values templates reading _seenPopoverOpen /
    // _seenPopoverX / _seenPopoverY / _seenPopoverViewers before the first
    // event fire ReferenceError. BUG-alpine-init-hydration.
    _seenPopoverOpen: false,
    _seenPopoverX: 0,
    _seenPopoverY: 0,
    _seenPopoverViewers: [] as Array<{ actorId: string; state: string; seenAt: string | null }>,
    // ── Chat-list / message-list defaults — chatLifecycle.init() also sets
    // these (lines 25-31), but Alpine evaluates child templates synchronously
    // and the inner storyState init() can race the outer chatState init()'s
    // sync portion, leaving the fields undefined when message-list.html is
    // first walked. Defining them here guarantees presence on first render.
    _isScrolledUp: false,
    _contextMenu: { visible: false, messageId: null, x: 0, y: 0, },
    _reactionPicker: { visible: false, messageId: "", x: 0, y: 0, },
    _flagDialog: { open: false, contentType: "message", contentId: null, chatId: null, },
    _flagReason: "",
    _flagOther: "",
    _flagBusy: false,
    // _quickEmojis: set in init() lines 48-64 — also define here for first-render safety.
    _quickEmojis: ["👍", "❤️", "😂", "🎭", "⚔️", "🗡️", "🏰", "✨", "💀", "🐉", "🌲", "⚡", "🔥", "💧", "🌙",],
    // _draftBackup: chat-drafts sets it; default undefined to keep type stable for first-render reads.
    _draftBackup: undefined as string | undefined,
    _searchResults: [] as {
      chatId: string;
      chatName: string;
      characterName: string;
      characterAvatar: string | null;
    }[],
    // ── World channels (chat-only worlds) ──
    _worlds: [] as { id: string; name: string }[],
    _worldChats: {} as Record<string, WorldChannelChat[]>,
    _worldExpanded: {} as Record<string, boolean>,
    _worldsLoading: false,
    worldJoinCode: "",

    // ── Chat search / joinable discovery ──
    ...chatSearch,

    // ── Joinable chat discovery / join state (methods live in chatSearch) ──
    _joinableChats: [] as {
      chatId: string;
      chatName: string;
      participantCount: number;
      lastActiveAt: string | null;
    }[],

    get filteredChats() {
      return filterChatList(this.chats, this._chatFilter,);
    },

    get currentChat() {
      return findActiveChat(this.chats, this.activeChat,);
    },

    /**
     * Recent assistant tool calls (newest first, capped at 20) for the
     *  unified GM & Assistant panel's Assistant tab.
     * @returns the newest-first tool-call list
     */
    get assistantToolCalls(): AssistantToolCall[] {
      return collectAssistantToolCalls(this.messages ?? [],);
    },

    // ── RPG Stats State ──
    ...rpgStats,
    showRpgPanel: false as boolean,

    // ── Mood System ──
    ...moodState,

    // ── Memory Panel State ──
    ...memoryPanel,

    // ── Sub-module state + methods ──
    ...chatKeys,
    ...chatGroup,
    ...chatSettings,
    ...chatPromptTemplate,
    ...chatQuickReplies,
    ...chatBattle,
    ...chatPanels,
    ...chatProactive,
    ...creationWizard,

    // ── Lifecycle (init / destroy / user + chat list load) ──
    ...chatLifecycle,
    ...chatWorld,

    // ── Sub-module methods ──
    ...chatKeys,
    ...chatFilters,
    ...chatGroup,
    ...chatSettings,
    ...chatBackgrounds,
    ...messageSearch,
    ...chatMessages,
    ...chatGenerations,
    ...chatVariants,
    ...chatActivity,
    ...chatManagement,
    ...chatEditing,
    ...attachValidateDraft(createComposerPreSend(),),
    ...chatActions,
    ...promptImproveActions,
    ...promptAnalyzeActions,
    ...gifPicker,
    ...chatMusicEmbed,
    ...chatPins,
    ...messageArchive,
    ...chatInvites,
    ...worldChannels,
  };

  // chatLocation + chatUtils + chatSections + chatSectionsNav declare `get`
  // accessors — plain spread would evaluate them once and freeze the result.
  mergeReactiveSource(state, chatLocation,);
  mergeReactiveSource(state, chatUtils,);
  mergeReactiveSource(state, chatSections,);
  mergeReactiveSource(state, chatSectionsNav,);
  // chatParticipants declares getters (isGroupChat, filteredAvailableActors) —
  // a plain spread would freeze them, so merge descriptor-preserving.
  mergeReactiveSource(state, chatParticipants,);
  // chatSideChannels declares a getter (isGroupChat) — merge descriptor-preserving.
  mergeReactiveSource(state, chatSideChannels,);

  return state as unknown as AlpineState<ChatState>;
}
