// ── Chat page component (chat.html) — core state + init ────

import { chatMessages } from "./chat-messages";
import { chatGenerations } from "./chat-generations";
import { chatManagement } from "./chat-management";
import { chatEditing } from "./chat-editing";
import { chatUtils } from "./chat-utils";
import type { AlpineState, ChatState } from "./types";
import { browserImportKey } from "../browser";
import { log as rootLog } from "./logger";
const log = rootLog.child({ module: "chat-state" });

// Configure marked for GFM (tables, strikethrough, task-lists) + line breaks
// Imported in chat-utils.ts but must run once
import { marked } from "marked";
marked.use({ breaks: true, gfm: true });

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

    // Cleanup handles
    _observer: null as MutationObserver | null,
    _toggleChatListHandler: (() => {}) as () => void,
    _toggleGalleryHandler: (() => {}) as () => void,
    _toggleCharacterInfoHandler: (() => {}) as () => void,

    // ── Encryption state ──
    _chatKey: null as CryptoKey | null,
    _encryptionEnabled: false as boolean,
    _keyId: null as string | null,

    // ── Core methods ──
    async init() {
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

      this._observer = new MutationObserver(() => {
        if (!document.contains(this.$el)) {
          this.destroy();
        }
      });
      this._observer.observe(document.body, { childList: true, subtree: true });

      document.addEventListener("keydown", (e: KeyboardEvent) => {
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
      });
    },

    destroy() {
      document.removeEventListener("toggle-chat-list", this._toggleChatListHandler);
      document.removeEventListener("toggle-gallery", this._toggleGalleryHandler);
      document.removeEventListener("toggle-character-info", this._toggleCharacterInfoHandler);

      this._cleanupSSE?.();

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
    ...chatUtils,
  } as AlpineState<ChatState>;
};
