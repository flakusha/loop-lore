// ── Chat page component (chat.html) — core state + init ────

import { chatMessages } from "./chat-messages";
import { chatGenerations } from "./chat-generations";
import { chatManagement } from "./chat-management";
import { chatEditing } from "./chat-editing";
import { chatActions } from "./chat-actions";
import { chatUtils } from "./chat-utils";
import type { AlpineState, ChatState } from "./types";
import { browserImportKey } from "../browser";
import { log as rootLog } from "./logger";
const log = rootLog.child({ module: "chat-state" });

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

    // Cleanup handles
    _observer: null as MutationObserver | null,
    _toggleChatListHandler: null as (() => void) | null,
    _toggleGalleryHandler: null as (() => void) | null,
    _toggleCharacterInfoHandler: null as (() => void) | null,
    _panelClickHandler: null as ((e: MouseEvent) => void) | null,
    _keydownHandler: null as ((e: KeyboardEvent) => void) | null,

    // ── Encryption state ──
    _chatKey: null as CryptoKey | null,
    _encryptionEnabled: false as boolean,
    _keyId: null as string | null,
    _storageHandler: null as ((e: StorageEvent) => void) | null,

    // ── Core methods ──
    async init() {
      // Ensure generation state is clean on fresh mount (prevents stale
      // isGenerating stuck after htmx morph re-initialization)
      this.isGenerating = false;
      this.isContinuing = false;
      this.activeAttemptId = null;
      this.continuingMessageId = null;

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

      const params = new URLSearchParams(location.search);
      const chatId = params.get("chatid");
      if (chatId) {
        await this.selectChat(chatId);
      }

      this._toggleChatListHandler = () => {
        Alpine.store("ui").showChatList = !Alpine.store("ui").showChatList;
      };
      this._toggleGalleryHandler = () => {
        Alpine.store("ui").showGallery = !Alpine.store("ui").showGallery;
      };
      this._toggleCharacterInfoHandler = () => {
        Alpine.store("ui").showCharacterInfo = true;
      };
      document.addEventListener("toggle-chat-list", this._toggleChatListHandler);
      document.addEventListener("toggle-gallery", this._toggleGalleryHandler);
      document.addEventListener("toggle-character-info", this._toggleCharacterInfoHandler);

      // Panel close: vanilla JS delegation (not @click directives) so close
      // buttons in gallery sidebar / character info / chat list work reliably
      // even after htmx morph swaps where Alpine @click may not re-compile
      // on elements without their own x-data.
      this._panelClickHandler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const ui = Alpine.store("ui");
        const closeBtn = target.closest(
          ".gallery-sidebar .btn-icon, .right-panel .btn-icon, .chat-list-panel .btn-icon",
        );
        if (closeBtn) {
          if (closeBtn.closest(".gallery-sidebar")) ui.showGallery = false;
          else if (closeBtn.closest(".right-panel")) ui.showCharacterInfo = false;
          else if (closeBtn.closest(".chat-list-panel")) ui.showChatList = false;
          return;
        }
        const backdrop = target.closest(".panel-backdrop");
        if (backdrop) {
          ui.showGallery = false;
          ui.showCharacterInfo = false;
          ui.showChatList = false;
        }
      };
      document.addEventListener("click", this._panelClickHandler, { capture: true });

      this._observer = new MutationObserver(() => {
        if (!document.contains(this.$el)) {
          this.destroy();
        }
      });
      this._observer.observe(document.body, { childList: true, subtree: true });

      this._keydownHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          if (Alpine.store("ui").showChatList) {
            Alpine.store("ui").showChatList = false;
          } else if (Alpine.store("ui").showGallery) {
            Alpine.store("ui").showGallery = false;
          } else if (Alpine.store("ui").showCharacterInfo) {
            Alpine.store("ui").showCharacterInfo = false;
          }
        }
        if (e.ctrlKey && e.key === "j") {
          const focusedMsg = document.querySelector<HTMLElement>(".message.focused");
          if (focusedMsg) {
            const msgId = focusedMsg.dataset.messageId;
            if (msgId) this.continueMessage(msgId);
          }
        }
      };
      document.addEventListener("keydown", this._keydownHandler);
    },

    destroy() {
      if (this._toggleChatListHandler)
        document.removeEventListener("toggle-chat-list", this._toggleChatListHandler);
      if (this._toggleGalleryHandler)
        document.removeEventListener("toggle-gallery", this._toggleGalleryHandler);
      if (this._toggleCharacterInfoHandler)
        document.removeEventListener("toggle-character-info", this._toggleCharacterInfoHandler);

      if (this._panelClickHandler) document.removeEventListener("click", this._panelClickHandler, true);

      if (this._keydownHandler) document.removeEventListener("keydown", this._keydownHandler);

      this._cleanupSSE?.();

      if (this._storageHandler) {
        removeEventListener("storage", this._storageHandler);
      }

      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
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
      Alpine.store("ui").hasActiveChat = true;
      const chat = this.chats.find((c: { id: string; name?: string }) => c.id === chatId);
      this.activeChatName = chat?.name || "Chat";
      const titleEl = document.querySelector<HTMLElement>("#page-title");
      if (titleEl) titleEl.textContent = this.activeChatName;
      history.replaceState(null, "", `/views/chat?chatid=${chatId}`);
      this.currentPage = 1;
      this.hasMoreMessages = true;
      this.loadingOlder = false;
      await Promise.all([this.loadMessages(), this.loadGalleryAssets(), this.loadCharacterInfo()]);
      await this.loadChatKey(chatId);
      await this.loadImpersonationState();
    },

    async loadChatKey(chatId: string) {
      try {
        const res = await apiFetch(`/api/chats/${chatId}/encryption-key`);
        if (!res.ok) {
          this._encryptionEnabled = false;
          this._chatKey = null;
          this._keyId = null;
          globalThis.__chatKey = null;
          globalThis.__chatKeyId = null;
          return;
        }
        const data = await res.json();
        this._chatKey = await browserImportKey(data.rawKey);
        this._keyId = data.keyId;
        this._encryptionEnabled = true;
        globalThis.__chatKey = this._chatKey;
        globalThis.__chatKeyId = this._keyId;
        log.info("Encryption key loaded for chat", { chatId, keyId: data.keyId });
      } catch {
        this._encryptionEnabled = false;
        this._chatKey = null;
        this._keyId = null;
        globalThis.__chatKey = null;
        globalThis.__chatKeyId = null;
      }
    },

    getChatId() {
      return this.activeChat;
    },

    // ── Sub-module methods ──
    ...chatMessages,
    ...chatGenerations,
    ...chatManagement,
    ...chatEditing,
    ...chatActions,
    ...chatUtils,
  } as AlpineState<ChatState>;
};
