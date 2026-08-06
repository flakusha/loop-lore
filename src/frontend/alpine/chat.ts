// ── Chat page component (chat.html) — core state + init ────

import { destroyVnRenderer, } from "../vn";
import { chatActions, } from "./chat-actions";
import { chatActivity, } from "./chat-activity";
import { chatBackgrounds, } from "./chat-backgrounds";
import { chatEditing, } from "./chat-editing";
import { chatFilters, } from "./chat-filters";
import { chatGenerations, } from "./chat-generations";
import { chatGroup, } from "./chat-group";
import { chatKeys, } from "./chat-keys";
import { chatLocation, } from "./chat-location";
import { chatManagement, } from "./chat-management";
import { chatMessages, } from "./chat-messages";
import { chatPanels, } from "./chat-panels";
import { chatSections, } from "./chat-sections";
import { chatSettings, } from "./chat-settings";
import { chatUtils, } from "./chat-utils";
import { chatVariants, } from "./chat-variants";
import { t, } from "./i18n";
import { jsonParseOr, } from "./json";
import { getLogger, } from "./logger";
import { memoryPanel, } from "./memory-panel";
import { messageSearch, } from "./message-search";
import { moodState, } from "./mood";
import { rpgStats, } from "./rpg-stats";
import type { AlpineState, ChatState, WorldChannelChat, } from "./types";
import { worldChannels, } from "./world-channels";

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
    generationLabel: t("status.characterResponding",),
    activeAttemptId: null as string | null,
    continuingMessageId: null as string | null,
    isContinuing: false,
    _generationEventSource: null as EventSource | null,
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
    _activityEventSource: null as EventSource | null,
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

    async searchChats(q: string,) {
      const query = (q || "").trim();
      if (!query) {
        this._searchResults = [];
        return;
      }
      try {
        const res = await apiFetch(`/api/chats/search?q=${encodeURIComponent(query,)}`,);
        if (!res.ok) {
          this._searchResults = [];
          return;
        }
        const body = await res.json();
        const data = Array.isArray(body,)
          ? body
          : (body as {
            data?: { chatId: string; chatName: string; characterName: string; characterAvatar: string | null }[];
          }).data ?? [];
        this._searchResults = data.map((r,) => ({
          chatId: r.chatId as string,
          chatName: r.chatName as string,
          characterName: r.characterName as string,
          characterAvatar: r.characterAvatar ?? null,
        }));
      } catch (error) {
        getLogger().error("Failed to search chats", error instanceof Error ? error : new Error(String(error,),), {},);
        this._searchResults = [];
      }
    },

    // ── Joinable chat discovery / join ──────────────────────────
    _joinableChats: [] as {
      chatId: string;
      chatName: string;
      participantCount: number;
      lastActiveAt: string | null;
    }[],

    async loadJoinableChats() {
      try {
        const res = await apiFetch("/api/chats/joinable",);
        if (!res.ok) { return; }
        const body = await res.json();
        const data = Array.isArray(body,)
          ? body
          : (body as {
            data?: { chatId: string; chatName: string; participantCount: number; lastActiveAt: string | null }[];
          }).data ?? [];
        this._joinableChats = data.map((r,) => ({
          chatId: r.chatId as string,
          chatName: r.chatName as string,
          participantCount: (r.participantCount as number) ?? 0,
          lastActiveAt: (r.lastActiveAt as string | null) ?? null,
        }));
      } catch (error) {
        getLogger().error(
          "Failed to load joinable chats",
          error instanceof Error ? error : new Error(String(error,),),
          {},
        );
        this._joinableChats = [];
      }
    },

    async joinChat(chatId: string,) {
      try {
        const res = await apiFetch(`/api/chats/${chatId}/join`, { method: "POST", },);
        if (!res.ok) {
          this.$dispatch?.("show-toast", { type: "error", message: t("toasts.couldNotJoinChat",), },);
          return;
        }
        // Refresh the joinable list + local chat list after joining.
        await Promise.all([this.loadJoinableChats(), this.loadChats?.(),],);
        this.$dispatch?.("show-toast", { type: "info", message: t("toasts.joinedChat",), },);
      } catch (error) {
        getLogger().error("Failed to join chat", error instanceof Error ? error : new Error(String(error,),), {},);
        this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedJoinChat",), },);
      }
    },

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

    // ── GM Panel State ──
    showGmPanel: false as boolean,

    // ── Mood System ──
    ...moodState,

    // ── Memory Panel State ──
    ...memoryPanel,

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
      this.loadWorldChannels();
      this.loadJoinableChats();
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
      destroyVnRenderer();

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
    },

    async loadUserInfo() {
      try {
        const res = await apiFetch("/api/auth/me",);
        if (res.ok) {
          const user = await res.json();
          this.userDisplayName = user.display_name || user.username || t("common.user",);
          this.userRole = user.role || "solo";
        }
      } catch {
        // Silent
      }
    },

    async loadChats() {
      try {
        const res = await apiFetch(`/api/chats?${this._filterParams?.() ?? "pageSize=200"}`,);
        if (!res.ok) {
          this.$dispatch("show-toast", { type: "error", message: t("toasts.failedLoadChats",), },);
          return;
        }
        const data = await res.json();
        this.chats = data.data || [];
      } catch {
        this.$dispatch("show-toast", { type: "error", message: t("toasts.failedLoadChats",), },);
      }
    },

    // ── World channels (chat-only worlds) ──
    /** Load chat-only worlds and their grouped channels for the sidebar tree. */
    async loadWorldChannels() {
      if (this._worldsLoading) { return; }
      this._worldsLoading = true;
      try {
        const res = await apiFetch("/api/worlds?pageSize=50",);
        if (!res.ok) { return; }
        const body = await res.json();
        const rows = (body.data || []) as { id: string; name: string; kind?: string }[];
        const worlds: { id: string; name: string }[] = [];
        for (const w of rows) {
          if (w.kind === "chat") {
            worlds.push({ id: w.id, name: w.name, },);
          }
        }
        this._worlds = worlds;
        for (const w of this._worlds) {
          await this.loadWorldChats(w.id,);
        }
      } catch {
        /* ignore — chat list still works without the tree */
      } finally {
        this._worldsLoading = false;
      }
    },

    /** Load one world's channel chats via the grouped endpoint. */
    async loadWorldChats(worldId: string,) {
      try {
        const res = await apiFetch(`/api/worlds/${worldId}/chats`,);
        if (!res.ok) { return; }
        const body = await res.json();
        this._worldChats = { ...this._worldChats, [worldId]: body.data || [], };
      } catch {
        this._worldChats = { ...this._worldChats, [worldId]: [], };
      }
    },

    toggleWorld(worldId: string,) {
      this._worldExpanded = { ...this._worldExpanded, [worldId]: !this._worldExpanded[worldId], };
      if (this._worldExpanded[worldId] && !this._worldChats[worldId]) {
        this.loadWorldChats(worldId,);
      }
    },

    async selectChat(chatId: string,) {
      if (this.isGenerating) {
        this.$dispatch("show-toast", {
          type: "warning",
          message: t("toasts.completeGenerationFirst",),
        },);
        return;
      }
      this.loadingError = null;
      this.activeChat = chatId;
      getLogger().setBindings({ chatId, },);
      Alpine.store("ui",).hasActiveChat = true;
      // Selecting a chat dismisses the transient side panels so the header
      // actions stay clickable (an open drawer overlaps the header buttons).
      Alpine.store("ui",).showChatList = false;
      Alpine.store("ui",).showGallery = false;
      Alpine.store("ui",).showCharacterInfo = false;
      const chat = this.chats.find((c: { id: string; name?: string },) => c.id === chatId);
      this.activeChatName = chat?.name || t("chats.untitledChat",);
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
      await Promise.all([this.loadMessages(), this.loadGalleryAssets(), this.loadCharacterInfo(), this.loadMood(),],);
      await this.markChatAsRead(chatId,);
      await this.loadChatKey(chatId,);
      await this.loadImpersonationState();
      await this.loadChatParticipants();
      // Location-scoped features: reset per-chat state then load fresh.
      this._sections = [];
      this._activeSectionId = null;
      this._background = null;
      this._locations = [];
      this._selectedLocationId = "";
      this._chatWorldId = null;
      this._chatCurrentLocationId = null;
      this._chatRecentLocationChanged = false;
      this._locationJoinableChats = [];
      await Promise.all([this.loadSections(), this.loadBackground(),],);
    },

    getChatId() {
      return this.activeChat;
    },

    // ── Sub-module methods ──
    ...chatKeys,
    ...chatFilters,
    ...chatGroup,
    ...chatSettings,
    ...chatSections,
    ...chatLocation,
    ...chatBackgrounds,
    ...messageSearch,
    ...chatMessages,
    ...chatGenerations,
    ...chatVariants,
    ...chatActivity,
    ...chatManagement,
    ...chatEditing,
    ...chatActions,
    ...chatUtils,
    ...worldChannels,
  } as AlpineState<ChatState>;
};
