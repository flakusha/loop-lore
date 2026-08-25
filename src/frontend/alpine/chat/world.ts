// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { getLogger, } from "../logger";
import type { ChatState, } from "../types";

const g = globalThis as Record<string, unknown>;

/** Chat-only world channels sidebar tree. */
export const chatWorld: Partial<ChatState> & ThisType<ChatState> = {
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
    // Reentrancy guard: overlapping selectChat calls interleave their loads and
    // interleave last-writer-wins writes → mixed-chat state.
    if (this._selectingChat) { return; }
    if (this.isGenerating) {
      this.$dispatch("show-toast", {
        type: "warning",
        message: t("toasts.completeGenerationFirst",),
      },);
      return;
    }
    this._selectingChat = true;
    try {
      await this._selectChatInner(chatId,);
    } finally {
      this._selectingChat = false;
    }
  },

  async _selectChatInner(chatId: string,) {
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
    // Location-scoped features: reset per-chat state BEFORE loading so the
    // fresh rows fetched below are not wiped by a post-load reset.
    this._sections = [];
    this._activeSectionId = null;
    this._background = null;
    this._locations = [];
    this._selectedLocationId = "";
    this._chatWorldId = null;
    this._chatCurrentLocationId = null;
    this._chatRecentLocationChanged = false;
    this._locationJoinableChats = [];
    const selectReload = await Promise.allSettled([
      this.loadMessages(),
      this.loadSections(),
      this.loadBackground(),
      this.loadGalleryAssets(),
      this.loadCharacterInfo(),
      this.loadMood(),
    ],);
    if (selectReload.some((r,) => r.status === "rejected")) { throw new Error("select chat reload failed",); }
    await this.markChatAsRead(chatId,);
    await this.loadChatKey(chatId,);
    await this.loadImpersonationState();
    // Quick-reply buttons + startup-triggered automation for this chat.
    this.loadQuickReplies();
    await this.fireStartupQuickReplies();
    // Proactive messaging scheduler — poll for due character-initiated messages.
    this.startProactiveScheduler();
    if (this.isGroupChat) {
      await this.loadParticipants();
      await this.loadTurnOrder();
      await this.loadAvailableActors();
    }
  },

  getChatId() {
    return this.activeChat;
  },
};
