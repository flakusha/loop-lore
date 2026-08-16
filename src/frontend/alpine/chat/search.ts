// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { getLogger, } from "../logger";
import type { ChatState, } from "../types";

/** Chat search discovery + joinable-chat discovery/join + chat getters. */
export const chatSearch: Partial<ChatState> & ThisType<ChatState> = {
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
      this._searchResults = Array.from(data, (r,) => ({
        chatId: r.chatId as string,
        chatName: r.chatName as string,
        characterName: r.characterName as string,
        characterAvatar: r.characterAvatar ?? null,
      }),);
    } catch (error) {
      getLogger().error("Failed to search chats", error instanceof Error ? error : new Error(String(error,),), {},);
      this._searchResults = [];
    }
  },

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
      this._joinableChats = Array.from(data, (r,) => ({
        chatId: r.chatId as string,
        chatName: r.chatName as string,
        participantCount: (r.participantCount as number) ?? 0,
        lastActiveAt: (r.lastActiveAt as string | null) ?? null,
      }),);
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
      const joinReload = await Promise.allSettled([this.loadJoinableChats(), this.loadChats?.(),],);
      if (joinReload.some((r,) => r.status === "rejected")) { throw new Error("join reload failed",); }
      this.$dispatch?.("show-toast", { type: "info", message: t("toasts.joinedChat",), },);
    } catch (error) {
      getLogger().error("Failed to join chat", error instanceof Error ? error : new Error(String(error,),), {},);
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedJoinChat",), },);
    }
  },
};
