// ── Chat page component (chat.html) — core state + init ────

import { chatMessages } from "./chat-messages";
import { chatGenerations } from "./chat-generations";
import { chatVariants } from "./chat-variants";
import { chatActivity } from "./chat-activity";
import { chatManagement } from "./chat-management";
import { chatGroup } from "./chat-group";
import { chatSettings } from "./chat-settings";
import { chatEditing } from "./chat-editing";
import { chatActions } from "./chat-actions";
import { chatUtils } from "./chat-utils";
import { getLogger } from "./logger";
import { chatKeys } from "./chat-keys";
import { chatPanels } from "./chat-panels";
import type { AlpineState, ChatState } from "./types";
import { jsonParseOr } from "./json";

const g = globalThis as Record<string, unknown>;

g.isChatPaused = (chat: Record<string, unknown>): boolean => {
  if (!chat?.story_state) return false;
  const state = jsonParseOr<Record<string, unknown>>(chat.story_state as string, {});
  return state.isPaused === true;
};

g.toggleGroupPause = async function () {
  const el = document.querySelector<HTMLElement>("[x-data]");
  if (el && typeof Alpine !== "undefined") {
    const data = Alpine.$data(el);
    const fn = (data as Record<string, unknown>).toggleGroupPause as (() => Promise<void>) | undefined;
    if (typeof fn === "function") {
      await fn();
    }
  }
};

globalThis.chatState = function () {
  return {
    // ── Core state ──
    isGenerating: false,
    generationLabel: "Character is responding...",
    activeAttemptId: null as string | null,
    continuingMessageId: null as string | null,
    isContinuing: false,
    _generationEventSource: null as EventSource | null,
    chats: [] as Array<{ id: string; name?: string }>,
    activeChat: null as string | null,
    messages: [] as Array<{
      id: string;
      role: string;
      content: string;
      created_at: string;
      thinking?: string;
      actor_name?: string;
      totalVariants?: number;
      variantIndex?: number;
      attachments?: Array<{
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
      }>;
    }>,
    loadingMessages: false,
    loadingError: null as string | null,
    hasMoreMessages: true,
    loadingOlder: false,
    currentPage: 1,
    totalPages: 1,
    scrollObserver: null as IntersectionObserver | null,
    activeChatName: "Welcome to loop-lore",
    galleryAssets: [] as Array<{
      id: string;
      name?: string;
      filename?: string;
      asset_type?: string;
      mime_type?: string;
      size_bytes?: number;
      width?: number;
      height?: number;
      alt_text?: string;
    }>,
    userDisplayName: "User",
    userRole: "solo",
    currentCharacter: null as {
      id: string;
      display_name?: string;
      name?: string;
      description?: string;
    } | null,
    generationDetail: null as {
      model?: string;
      elapsedMs?: number;
      chunksReceived?: number;
      charsReceived?: number;
      status?: string;
      attemptId?: string;
    } | null,
    detailLevel: "Immersion" as "Immersion" | "Basic" | "Detailed",
    impersonationActive: false as boolean,
    impersonatingActorId: null as string | null,
    _hamburgerOpen: {} as Record<string, boolean>,
    _statsOpen: {} as Record<string, boolean>,
    _impersonationLoaded: false as boolean,
    _unseenCounts: {} as Record<string, number>,
    _activityEventSource: null as EventSource | null,
    _chatFilter: "",

    get filteredChats() {
      const filter = (this._chatFilter || "").toLowerCase();
      if (!filter) return this.chats;
      return this.chats.filter((c: { name?: string }) => (c.name || "").toLowerCase().includes(filter));
    },

    get currentChat() {
      return this.chats.find((c: { id: string; name?: string }) => c.id === this.activeChat) ?? null;
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
      this._contextMenu = { visible: false, messageId: null, x: 0, y: 0 };

      // Force-reset panel visibility on every mount (belt-and-suspenders
      // against stale store state from a previous component instance)
      Alpine.store("ui").showGallery = false;
      Alpine.store("ui").showChatList = false;
      Alpine.store("ui").showCharacterInfo = false;

      const storedDetail = localStorage.getItem("chat-detail-level");
      if (storedDetail === "Basic" || storedDetail === "Detailed") {
        this.detailLevel = storedDetail;
      }
      this._storageHandler = (e: StorageEvent) => {
        if (e.key !== "chat-detail-level" || !e.newValue) return;
        if (["Immersion", "Basic", "Detailed"].includes(e.newValue)) {
          this.detailLevel = e.newValue as "Immersion" | "Basic" | "Detailed";
        }
      };
      addEventListener("storage", this._storageHandler);
      await this.loadChats();
      this.loadUserInfo();
      this.connectActivitySSE();

      const params = new URLSearchParams(location.search);
      const chatId = params.get("chatid");
      if (chatId) {
        const chatExists = this.chats.some((c: { id: string }) => c.id === chatId);
        if (!chatExists) {
          // Chat was deleted or doesn't exist — redirect to chat view without chatid
          globalThis.location.assign("/views/chat");
          return;
        }
        await this.selectChat(chatId);
      }

      this.registerPanelHandlers();
    },

    destroy() {
      this.unregisterPanelHandlers();

      this._cleanupSSE?.();
      this.disconnectActivitySSE();

      if (this._storageHandler) {
        removeEventListener("storage", this._storageHandler);
      }

      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
      }

      if (this._scrollHandler) {
        const el = document.querySelector("#message-list");
        el?.removeEventListener("scroll", this._scrollHandler);
        this._scrollHandler = null;
      }

      if (globalThis.Alpine) {
        const uiStore = Alpine.store("ui");
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
        const res = await apiFetch("/api/auth/me");
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
        const res = await apiFetch("/api/chats?pageSize=200");
        if (!res.ok) {
          this.$dispatch("show-toast", { type: "error", message: "Failed to load chats" });
          return;
        }
        const data = await res.json();
        this.chats = data.data || [];
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Failed to load chats" });
      }
    },

    async selectChat(chatId: string) {
      if (this.isGenerating) {
        this.$dispatch("show-toast", {
          type: "warning",
          message: "Complete current generation before switching chats",
        });
        return;
      }
      this.loadingError = null;
      this.activeChat = chatId;
      getLogger().setBindings({ chatId });
      Alpine.store("ui").hasActiveChat = true;
      const chat = this.chats.find((c: { id: string; name?: string }) => c.id === chatId);
      this.activeChatName = chat?.name || "Chat";
      if (g.Alpine) {
        try {
          Alpine.store("chat").currentChat = chat || null;
        } catch {
          /* store not ready */
        }
      }
      const titleEl = document.querySelector<HTMLElement>("#page-title");
      if (titleEl) titleEl.textContent = this.activeChatName;
      history.replaceState(null, "", `/views/chat?chatid=${chatId}`);
      this.currentPage = 1;
      this.hasMoreMessages = true;
      this.loadingOlder = false;
      await Promise.all([this.loadMessages(), this.loadGalleryAssets(), this.loadCharacterInfo()]);
      await this.markChatAsRead(chatId);
      await this.loadChatKey(chatId);
      await this.loadImpersonationState();
      await this.loadChatParticipants();
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
