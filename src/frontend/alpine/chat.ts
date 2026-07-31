// ── Chat page component (chat.html) — core state + init ────
import {
  addScene,
  destroyVnRenderer,
  initVnRenderer,
  type VnMessage,
} from "../vn";
import { chatActions, } from "./chat-actions";
import { chatActivity, } from "./chat-activity";
import { chatEditing, } from "./chat-editing";
import { chatGenerations, } from "./chat-generations";
import { chatGroup, } from "./chat-group";
import { chatKeys, } from "./chat-keys";
import { chatManagement, } from "./chat-management";
import { chatMessages, } from "./chat-messages";
import { chatPanels, } from "./chat-panels";
import { chatSettings, } from "./chat-settings";
import { chatUtils, } from "./chat-utils";
import { chatVariants, } from "./chat-variants";
import { jsonParseOr, } from "./json";
import { getLogger, } from "./logger";
import { memoryPanel, } from "./memory-panel";
import { createMoodPanelState, } from "./mood-panel";
import { rpgStats, } from "./rpg-stats";
import type { AlpineState, ChatState, } from "./types";

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

globalThis.chatState = function() {
  return {
    // ── Core state ──
    isGenerating: false,
    generationLabel: "Character is responding...",
    activeAttemptId: null as string | null,
    continuingMessageId: null as string | null,
    isContinuing: false,
    _generationEventSource: null as EventSource | null,
    // VN mode state
    _vnEnabled: false,
    _vnLayout: "overlay" as "overlay" | "below" | "split",
    _vnTypewriter: true,
    _vnTypewriterSpeed: 30,
    _vnTransition: "fade" as "fade" | "cut" | "dissolve" | "slide" | "wipe",
    _vnAutoAdvance: false,
    chats: [] as { id: string; name?: string }[],
    activeChat: null as string | null,
    messages: [] as {
      id: string;
      role: string;
      content: string;
      created_at: string;
      thinking?: string;
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
    activeChatName: "Welcome to loop-lore",
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
    userDisplayName: "User",
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
    _activityEventSource: null as EventSource | null,
    _chatFilter: "",

    get filteredChats() {
      const filter = (this._chatFilter || "").toLowerCase();
      if (!filter) { return this.chats; }
      return this.chats.filter((c: { name?: string },) => (c.name || "").toLowerCase().includes(filter,));
    },

    get currentChat() {
      return this.chats.find((c: { id: string; name?: string },) => c.id === this.activeChat) ?? null;
    },

    // ── RPG Stats State ──
    ...rpgStats,
    showRpgPanel: false as boolean,

    // ── Memory Panel State ──
    ...memoryPanel,

    // ── Mood Panel State ──
    _moodPanel: createMoodPanelState(),
    async loadMoodPanel(actorId: string,) {
      await Promise.allSettled([
        this._moodPanel.loadMood(actorId,),
        this._moodPanel.loadEmotions(actorId,),
        this._moodPanel.loadEmotionDefs(),
      ],);
    },

    // ── Sub-module state + methods ──
    ...chatKeys,
    ...chatGroup,
    ...chatSettings,
    ...chatPanels,
    async init() {
      // Ensure generation state is clean on fresh mount (prevents stale
      // isGenerating stuck after htmx morph re-initialization)
      this.isGenerating = false;
      this.isContinuing = false;
      this.activeAttemptId = null;
      this.continuingMessageId = null;
      this._isScrolledUp = false;
      this._contextMenu = { visible: false, messageId: null, x: 0, y: 0, };
      this._reactionPicker = { visible: false, messageId: "", x: 0, y: 0, };
      this._quickEmojis = [
        "👍",
        "❤️",
        "😂",
        "🎭",
        "⚔️",
        "🗡️",
        "🏰",
        "✨",
        "💀",
        "🐉",
        "🌲",
        "⚡",
        "🔥",
        "💧",
        "🌙",
      ];

      // Force-reset panel visibility on every mount (belt-and-suspenders
      // against stale store state from a previous component instance)
      Alpine.store("ui",).showGallery = false;
      Alpine.store("ui",).showChatList = false;
      Alpine.store("ui",).showCharacterInfo = false;
      Alpine.store("ui",).showMemoryPanel = false;

      const storedDetail = localStorage.getItem("chat-detail-level",);
      if (storedDetail === "Basic" || storedDetail === "Detailed") {
        this.detailLevel = storedDetail;
      }
      this._storageHandler = (e: StorageEvent,) => {
        if (e.key !== "chat-detail-level" || !e.newValue) { return; }
        if (["Immersion", "Basic", "Detailed",].includes(e.newValue,)) {
          this.detailLevel = e.newValue as "Immersion" | "Basic" | "Detailed";
        }
      };
      addEventListener("storage", this._storageHandler,);
      await this.loadChats();
      this.loadUserInfo();
      this.connectActivitySSE();

      const params = new URLSearchParams(location.search,);
      const chatId = params.get("chatid",);
      if (chatId) {
        const chatExists = this.chats.some((c: { id: string },) => c.id === chatId);
        if (!chatExists) {
          // Chat was deleted or doesn't exist — redirect to chat view without chatid
          globalThis.location.assign("/views/chat",);
          return;
        }
        await this.selectChat(chatId,);
      }

      this.registerPanelHandlers();
    },

    destroy() {
      this.unregisterPanelHandlers();

      this._cleanupSSE?.();
      this.disconnectActivitySSE();

      if (this._storageHandler) {
        removeEventListener("storage", this._storageHandler,);
      }

      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
      }

      if (this._scrollHandler) {
        const el = document.querySelector("#message-list",);
        el?.removeEventListener("scroll", this._scrollHandler,);
        this._scrollHandler = null;
      }

      if (globalThis.Alpine) {
        const uiStore = Alpine.store("ui",);
        if (uiStore) {
          uiStore.showChatList = false;
          uiStore.showGallery = false;
          uiStore.showCharacterInfo = false;
          uiStore.showChatSettings = false;
          uiStore.hasActiveChat = false;
        }
      }

      // Cleanup VN renderer
      destroyVnRenderer();
    },

    // ── VN Mode Lifecycle ──

    /** Initialize or destroy VN renderer based on current state. */
    updateVnMode() {
      const container = document.querySelector<HTMLElement>("#vn-container",);
      if (!container) { return; }

      if (this._vnEnabled && this.activeChat) {
        const vnMessages: VnMessage[] = this.messages.map((m,) => ({
          id: m.id,
          role: (m.role as VnMessage["role"]) ?? "assistant",
          name: m.actor_name,
          content: m.content,
          thinking: m.thinking,
          avatar_asset_id: undefined,
          background_url: undefined,
        }));
        const chat = this.chats.find((c,) => c.id === this.activeChat);
        const gmConfig = jsonParseOr<Record<string, unknown>>(chat?.gm_config ?? "{}", {},);
        initVnRenderer(container, vnMessages, gmConfig, this.activeChat,);
      } else {
        destroyVnRenderer();
      }
    },

    /** Push a new message into the live VN renderer (for streaming). */
    pushVnScene(msg: { id: string; role: string; name?: string; content: string; thinking?: string },) {
      if (!this._vnEnabled) { return; }
      addScene({
        id: msg.id,
        role: (msg.role as VnMessage["role"]) ?? "assistant",
        name: msg.name,
        content: msg.content,
        thinking: msg.thinking,
      },);
    },

    // ── GM Panel State ──
    showGmPanel: false as boolean,

    async loadUserInfo() {
      try {
        const res = await apiFetch("/api/auth/me",);
        if (res.ok) {
          const user = await res.json();
          this.userDisplayName = user.display_name || user.username || "User";
          this.userRole = user.role || "solo";
        }
      } catch {
        // Silent
      }
    },

    async loadChats() {
      try {
        const res = await apiFetch("/api/chats?pageSize=200",);
        if (!res.ok) {
          this.$dispatch("show-toast", { type: "error", message: "Failed to load chats", },);
          return;
        }
        const data = await res.json();
        this.chats = data.data || [];
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Failed to load chats", },);
      }
    },

    _searchDebounce: null as ReturnType<typeof setTimeout> | null,
    _searchResults: null as {
      chatId: string;
      chatName: string;
      chatType: string;
      chatMode: string;
      lastMessageAt: string;
      characterName: string;
      characterAvatar: string | null;
      worldId: string | null;
    }[] | null,

    async searchChats(query: string,) {
      // Clear previous debounce
      if (this._searchDebounce) {
        clearTimeout(this._searchDebounce,);
      }

      // If query is empty, clear results and show all chats
      if (!query.trim()) {
        this._searchResults = null;
        return;
      }

      // Debounce 300ms
      this._searchDebounce = setTimeout(async () => {
        try {
          const params = new URLSearchParams({ q: query, limit: "20", },);
          const res = await apiFetch(`/api/chats/search?${params.toString()}`,);
          if (res.ok) {
            const data = await res.json();
            this._searchResults = data.data || [];
          }
        } catch {
          // Non-critical — fall back to client-side filter
        }
      }, 300,);
    },

    async selectChat(chatId: string,) {
      if (this.isGenerating) {
        this.$dispatch("show-toast", {
          type: "warning",
          message: "Complete current generation before switching chats",
        },);
        return;
      }
      this.loadingError = null;
      this.activeChat = chatId;
      getLogger().setBindings({ chatId, },);
      Alpine.store("ui",).hasActiveChat = true;
      const chat = this.chats.find((c: { id: string; name?: string },) => c.id === chatId);
      this.activeChatName = chat?.name || "Chat";
      if (g.Alpine) {
        try {
          Alpine.store("chat",).currentChat = chat || null;
        } catch {
          /* store not ready */
        }
      }
      const titleEl = document.querySelector<HTMLElement>("#page-title",);
      if (titleEl) { titleEl.textContent = this.activeChatName; }
      history.replaceState(null, "", `/views/chat?chatid=${chatId}`,);
      this.currentPage = 1;
      this.hasMoreMessages = true;
      this.loadingOlder = false;
      await Promise.all([this.loadMessages(), this.loadGalleryAssets(), this.loadCharacterInfo(),],);
      await this.markChatAsRead(chatId,);
      await this.loadChatKey(chatId,);
      await this.loadImpersonationState();
      await this.loadChatParticipants();
      // Load mood data for the current character
      if (this.currentCharacter?.id) {
        await this.loadMoodPanel(this.currentCharacter.id,);
      }
      // Initialize VN mode if enabled
      this.updateVnMode();
    },

    getChatId() {
      return this.activeChat;
    },

    // ── Sub-module methods ──
    ...chatKeys,
    ...chatGroup,
    ...chatSettings,
    ...chatMessages,
    ...chatGenerations,
    ...chatVariants,
    ...chatActivity,
    ...chatManagement,
    ...chatEditing,
    ...chatActions,
    ...chatUtils,
  } as AlpineState<ChatState>;
};
