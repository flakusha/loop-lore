// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Chat inline state: core fields, getters, and panel mixins (incl. RPG
// questions) spread into chatState(). Extracted from bootstrap.ts.
import { type AssistantToolCall, collectAssistantToolCalls, } from "../chat-panels";
import { DEFAULT_QUICK_EMOJIS, } from "../chat-utils/emoji";
import {
  isNsfwRevealed,
  type NsfwRevealMap,
  shouldBlurNsfw,
  toggleNsfwReveal,
} from "../chat-utils/nsfw-blur";
import { t, } from "../i18n";
import { memoryPanel, } from "../memory-panel";
import { moodState, } from "../mood";
import { bodyStateState, } from "../nsfw-body";
import { nsfwPanelState, } from "../nsfw-panel";
import { rpgQuestions, } from "../rpg-questions";
import { rpgStats, } from "../rpg-stats";
import type { AlpineMagicThis, ChatState, WorldChannelChat, } from "../types";
import { chatSearch, } from "./search";

/** RPG questions mixin, co-located with the other chat/* mixins. */
export const chatRpgQuestions: Partial<ChatState> & ThisType<ChatState> = {
  ...rpgQuestions,
};

/** */
export const chatInlineState: Record<string, unknown> & ThisType<ChatState & AlpineMagicThis> = {
  // ── Core state ──
  isGenerating: false,
  generationLabel: t("status.characterResponding",),
  activeAttemptId: null as string | null,
  continuingMessageId: null as string | null,
  isContinuing: false,
  _generationEventSource: null as EventSource | null,
  _streamToolCalls: [] as string[],
  _streamContent: "",
  _jobStatusLine: "",
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
    /** Actor is NSFW-rated — the drawn portrait is coverable by the blur pref. */
    avatar_nsfw?: boolean;
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
      /** v1 rating signal (asset_links → actors) — coverable by the blur pref. */
      nsfw?: boolean;
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
  selectedAssetIds: [] as string[],
  _gallerySelectionAnchorId: null as string | null,
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
  /** Per-chat thinking visibility: hidden | collapsed | visible */
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
  _reactionActiveIndex: 0,
  // ── NSFW blur preference (default OFF — no behavior change until the user
  // opts in from settings; lifecycle.init() reads the localStorage mirror). ──
  nsfwBlurEnabled: false,
  _nsfwRevealed: {} as NsfwRevealMap,

  /**
   * Whether an NSFW-flagged piece of media should render covered right now.
   * @param nsfw - the payload's NSFW flag (undefined = not flagged)
   * @param key - media key: attachment asset id, or `avatar-<messageId>`
   * @returns {boolean} true when the item must render blurred/covered
   */
  nsfwBlurOn(nsfw: boolean | undefined, key: string,): boolean {
    return shouldBlurNsfw({
      nsfw,
      blurEnabled: this.nsfwBlurEnabled,
      revealed: isNsfwRevealed(this._nsfwRevealed, key,),
    },);
  },

  /**
   * Reveal one covered item. Client-side only — permission was established
   * before the content was served, so nothing is re-checked server-side.
   * @param key - media key to reveal
   * @returns {void}
   */
  revealNsfw(key: string,): void {
    this._nsfwRevealed = toggleNsfwReveal(this._nsfwRevealed, key,);
  },
  _flagDialog: { open: false, contentType: "message", contentId: null, chatId: null, },
  _flagReason: "",
  _flagOther: "",
  _flagBusy: false,
  // _quickEmojis: set in init() — also define here for first-render safety.
  _quickEmojis: [...DEFAULT_QUICK_EMOJIS,],
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

  // ── Joinable chat discovery / join ──────────────────────────
  _joinableChats: [] as {
    chatId: string;
    chatName: string;
    participantCount: number;
    lastActiveAt: string | null;
  }[],

  get filteredChats() {
    const filter = (this._chatFilter || "").toLowerCase();
    if (!filter) { return this.chats; }
    const out: typeof this.chats = [];
    for (const c of this.chats) { if ((c.name || "").toLowerCase().includes(filter,)) { out.push(c,); } }
    return out;
  },

  get currentChat() {
    return this.chats.find(
      (c: { id: string; name?: string; thinking_visibility?: string },) => c.id === this.activeChat,
    ) ?? null;
  },

  /**
   * Recent assistant tool calls (newest first, capped at 20) for the
   *  unified GM & Assistant panel's Assistant tab.
   */
  get assistantToolCalls(): AssistantToolCall[] {
    return collectAssistantToolCalls(this.messages ?? [],);
  },

  // ── RPG Stats State ──
  ...rpgStats,
  showRpgPanel: false as boolean,

  // ── RPG Questions State (TASK-029) ──
  ...chatRpgQuestions,

  // ── Mood System ──
  ...moodState,

  // ── Memory Panel State ──
  ...memoryPanel,

  // ── NSFW Panel State (read-only status) ──
  ...nsfwPanelState,

  // ── NSFW Body State (health / conditions / arousal) ──
  ...bodyStateState,
};
