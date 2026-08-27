// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonBody, } from "./json";
import type { ChatState, Message, } from "./types";

/**
 * Seen-state methods for chat messages.
 *
 * Extracted from chat-messages.ts to keep the main file under the 250L limit.
 */
export const chatSeenMethods: Partial<ChatState> & ThisType<ChatState> = {
  async loadMessageSeen(msgId: string,) {
    try {
      const res = await apiFetch(`/api/messages/${msgId}/seen`,);
      if (res.ok) {
        const viewers = await res.json();
        const msg = this.messages.find((m,) => m.id === msgId);
        if (msg) { (msg as Message & { seenState?: unknown }).seenState = viewers; }
      }
    } catch {
      // ignore
    }
  },

  async loadAllSeen() {
    if (!this.activeChat || this.messages.length === 0) { return; }
    const ids = Array.from(this.messages, (m,) => m.id,);
    await Promise.allSettled(Array.from(ids, (id,) => this.loadMessageSeen(id,),),);
  },

  async markSeen(msgId: string, state: "seen" | "processing" = "seen",) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/messages/${msgId}/seen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ actorId: this.currentActorId, state, },),
      },);
      if (res.ok) {
        await this.loadMessageSeen(msgId,);
      }
    } catch {
      // non-critical
    }
  },

  openSeenPopover(msgId: string, event: Event,) {
    const msg = this.messages.find((m,) => m.id === msgId);
    if (!msg) { return; }
    const seenState =
      (msg as Message & { seenState?: Array<{ actorId: string; state: string; seenAt: string | null }> }).seenState;
    if (!seenState || seenState.length === 0) { return; }
    const target = event.currentTarget as HTMLElement;
    this.$dispatch?.("show-seen-popover", {
      messageId: msgId,
      viewers: seenState,
      target,
    },);
  },

  seenTitle(seenState: Array<{ actorId: string; state: string; seenAt: string | null }>,) {
    const seen = seenState.filter((s,) => s.state === "seen").length;
    const processing = seenState.filter((s,) => s.state === "processing").length;
    const parts = [];
    if (seen > 0) { parts.push(`${seen} seen`,); }
    if (processing > 0) { parts.push(`${processing} processing`,); }
    return parts.join(", ",) || "No viewers";
  },

  seenCount(seenState: Array<{ actorId: string; state: string; seenAt: string | null }>,) {
    return seenState.length;
  },

  initSeenPopover() {
    document.addEventListener("show-seen-popover", (e: Event,) => {
      const detail = (e as CustomEvent).detail;
      this._seenPopoverViewers = detail.viewers;
      this._seenPopoverX = detail.target?.getBoundingClientRect?.()?.left ?? 0;
      this._seenPopoverY = (detail.target?.getBoundingClientRect?.()?.bottom ?? 0) + 8;
      this._seenPopoverOpen = true;
    },);
  },

  startSeenPolling() {
    if (this._seenPollTimer) { return; }
    this._seenPollTimer = setInterval(() => {
      if (this.activeChat && !this.loadingMessages) {
        this.loadAllSeen();
      }
    }, 5000,);
  },

  stopSeenPolling() {
    if (this._seenPollTimer) {
      clearInterval(this._seenPollTimer,);
      this._seenPollTimer = null;
    }
  },
};
