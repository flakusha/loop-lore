// ── Chat page component (chat.html) — core state + init ────
import { chatActions, } from "../chat-actions";
import { chatActivity, } from "../chat-activity";
import { chatBackgrounds, } from "../chat-backgrounds";
import { chatEditing, } from "../chat-editing";
import { chatFilters, } from "../chat-filters";
import { chatGenerations, } from "../chat-generations";
import { chatGroup, } from "../chat-group";
import { chatKeys, } from "../chat-keys";
import { chatLocation, } from "../chat-location";
import { chatManagement, } from "../chat-management";
import { chatMessages, } from "../chat-messages";
import { chatPanels, } from "../chat-panels";
import { chatSections, } from "../chat-sections";
import { chatSettings, } from "../chat-settings";
import { chatUtils, } from "../chat-utils";
import { chatVariants, } from "../chat-variants";
import { t, } from "../i18n";
import { jsonParseOr, } from "../json";
import { memoryPanel, } from "../memory-panel";
import { messageSearch, } from "../message-search";
import { moodState, } from "../mood";
import { rpgStats, } from "../rpg-stats";
import type { AlpineMagicThis, AlpineState, ChatState, WorldChannelChat, } from "../types";
import { worldChannels, } from "../world-channels";
import { chatLifecycle, } from "./lifecycle";
import { chatSearch, } from "./search";
import { chatWorld, } from "./world";

const g = globalThis as Record<string, unknown>;

g.isChatPaused = (chat: Record<string, unknown>,): boolean => {
  if (!chat?.story_state) { return false; }
  const state = jsonParseOr<Record<string, unknown>>(chat.story_state as string, {},);
  return state.isPaused === true;
};

g.toggleGroupPause = async function() {
  const el = document.querySelector<HTMLElement>("[x-data]",);
  if (el && typeof Alpine !== "undefined") {
    const data = Alpine.$data(el,);
    const fn = data.toggleGroupPause as (() => Promise<void>) | undefined;
    if (typeof fn === "function") {
      await fn();
    }
  }
};

/**
 * Merge a sub-module's own properties into the state object, preserving
 * accessors (getters/setters) as live properties. A plain object spread
 * (`...source`) EVALUATES getters at spread time and copies a stale snapshot,
 * so computed state like `groupedMessages` never recomputes. Use this for any
 * sub-module that declares `get`/`set` accessors consumed by templates.
 */
function mergeReactiveSource(target: Record<string, unknown>, source: object,): void {
  for (const name of Object.getOwnPropertyNames(source,)) {
    const desc = Object.getOwnPropertyDescriptor(source, name,);
    if (!desc) { continue; }
    if ("value" in desc) {
      target[name] = desc.value;
    } else {
      Object.defineProperty(target, name, desc,);
    }
  }
}

globalThis.chatState = function() {
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
    chats: [] as { id: string; name?: string }[],
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
    impersonationActive: false,
    impersonatingActorId: null as string | null,
    _hamburgerOpen: {},
    _statsOpen: {},
    _impersonationLoaded: false,
    _unseenCounts: {},
    _chatFilter: "",
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
      return this.chats.find((c: { id: string; name?: string },) => c.id === this.activeChat) ?? null;
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
    ...chatPanels,

    // ── Lifecycle (init / destroy / user + chat list load) ──
    ...chatLifecycle,
    ...chatWorld,

    // ── Sub-module methods ──
    ...chatKeys,
    ...chatFilters,
    ...chatGroup,
    ...chatSettings,
    ...chatSections,
    ...chatBackgrounds,
    ...messageSearch,
    ...chatMessages,
    ...chatGenerations,
    ...chatVariants,
    ...chatActivity,
    ...chatManagement,
    ...chatEditing,
    ...chatActions,
    ...worldChannels,
  };

  // chatLocation + chatUtils declare `get` accessors (groupedMessages,
  // selectedLocationName, currentLocationName). A plain spread would evaluate
  // them once and freeze the result, so merge them descriptor-preserving.
  mergeReactiveSource(state, chatLocation,);
  mergeReactiveSource(state, chatUtils,);

  return state as unknown as AlpineState<ChatState>;
};
