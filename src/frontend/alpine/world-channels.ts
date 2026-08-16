// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── World channels sidebar tree (chat-only worlds) ─────────
//
// Holds the sidebar tree logic for chat-only worlds: channels are grouped by
// their static location binding (`chats.current_location_id` acts as the
// channel's category), and invite codes redeem into world membership. The
// module owns no fetch for grouping; it reads `_worldChats` already loaded by
// `loadWorldChannels()` on ChatState. `joinWorldByCode()` is the only fetch,
// hitting POST /api/world-invites/:code/join.
import type { WorldChannelChat, } from "./chat-types";
import { t, } from "./i18n";
import type { ChatState, } from "./types";

export const worldChannels: Partial<ChatState> & ThisType<ChatState> = {
  /** Group a world's channel chats by location (channel category). */
  worldChatGroups(worldId: string,) {
    const chats = this._worldChats[worldId] || [];
    const groups = new Map<string, { locationId: string; locationName: string; chats: WorldChannelChat[] }>();
    for (const chat of chats) {
      const key = chat.current_location_id ?? "unlocated";
      let group = groups.get(key,);
      if (!group) {
        group = { locationId: key, locationName: chat.location_name || t("toasts.noChannel",), chats: [], };
        groups.set(key, group,);
      }
      group.chats.push(chat,);
    }
    return Array.from(groups.values(),);
  },

  /** Redeem a world invite code, then refresh the sidebar world tree. */
  async joinWorldByCode() {
    const code = (this.worldJoinCode || "").trim();
    if (!code) {
      this.$dispatch("show-toast", { type: "warning", message: t("toasts.enterWorldInviteCode",), },);
      return;
    }
    try {
      const res = await apiFetch(`/api/world-invites/${encodeURIComponent(code,)}/join`, {
        method: "POST",
      },);
      if (!res.ok) {
        const body = await res.json();
        this.$dispatch("show-toast", { type: "error", message: body.error || t("toasts.couldNotJoinWorld",), },);
        return;
      }
      const outcome = await res.json();
      this.worldJoinCode = "";
      this.$dispatch("show-toast", {
        type: "success",
        message: t(outcome.alreadyMember ? "toasts.alreadyMember" : "toasts.joinedWorld",),
      },);
      await this.loadWorldChannels();
    } catch {
      this.$dispatch("show-toast", { type: "error", message: t("toasts.networkError",), },);
    }
  },
};
