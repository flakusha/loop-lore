// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { ChatListResponse, } from "../../../validation/schemas/responses";
import { destroyVnRenderer, } from "../../vn";
import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import type { ChatState, } from "../types";
import { parseOr, } from "../validation";

const EMPTY_CHAT_PAGE = {
  data: [],
  pagination: { total: 0, page: 1, pageSize: 200, totalPages: 0, },
};

/** Chat page lifecycle + core list/user loading. */
export const chatLifecycle: Partial<ChatState> & ThisType<ChatState> = {
  async init() {
    // Ensure generation state is clean on fresh mount (prevents stale
    // isGenerating stuck after htmx morph re-initialization)
    this.isGenerating = false;
    this.isContinuing = false;
    this.activeAttemptId = null;
    this.continuingMessageId = null;
    this._isScrolledUp = false;
    this._contextMenu = { visible: false, messageId: null, x: 0, y: 0, };
    this._flagDialog = { open: false, contentType: "message", contentId: null, chatId: null, };
    this._flagReason = "";
    this._flagOther = "";
    this._flagBusy = false;
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
      if (params.get("openSettings",)) {
        await this.openChatSettings();
      }
    }

    this.registerPanelHandlers();
  },

  destroy() {
    this.unregisterPanelHandlers();
    destroyVnRenderer();

    this._cleanupSSE?.();
    this.stopProactiveScheduler();

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
        // Sync role to UI store so cross-component consumers (e.g. command
        // buttons toolbar) can filter GM-only actions.
        Alpine.store("ui",).userRole = this.userRole;
      }
    } catch {
      // Silent
    }
  },

  async loadChats() {
    try {
      const res = await apiFetch(`/api/v1/chats?${this._filterParams?.() ?? "pageSize=200"}`,);
      if (!res.ok) {
        this.$dispatch("show-toast", { type: "error", message: t("toasts.failedLoadChats",), },);
        return;
      }
      const page = parseOr(ChatListResponse, await res.json(), EMPTY_CHAT_PAGE,);
      this.chats = page.data;
    } catch {
      this.$dispatch("show-toast", { type: "error", message: t("toasts.failedLoadChats",), },);
    }
  },
};
