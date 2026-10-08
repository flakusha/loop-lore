// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, Message, } from "./types";

/**
 * Reaction methods for chat messages.
 *
 * Extracted from chat-messages.ts to keep the main file under the 250L limit.
 * Methods are merged into the chatMessages object at call time, so `this`
 * still resolves to the full ChatState.
 */
export const chatReactionMethods: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * @param {string} msgId
   * @param {string} emoji
   * @returns {Promise<void>}
   */
  async toggleReaction(msgId: string, emoji: string,) {
    if (!this.activeChat) { return; }
    // Optimistic update with rollback: apply the local toggle first for
    // instant feedback, confirm via the server, restore + toast on failure.
    // `t()` falls back to the key when the locale catalog is empty (tests).
    const msg = this.messages.find((m,) => m.id === msgId) as
      | (Message & { reactions?: { emoji: string; count: number; userReacted: boolean }[] })
      | undefined;

    const hadReactions = msg?.reactions !== undefined;
    const before = msg?.reactions?.map((r,) => ({ ...r, }));
    const restore = () => {
      if (!msg) { return; }
      if (hadReactions) { msg.reactions = before; }
      else { delete msg.reactions; }
    };

    const applyToggle = (add: boolean,) => {
      if (!msg) { return; }
      msg.reactions ??= [];
      const rows = msg.reactions;
      const row = rows.find((r,) => r.emoji === emoji);
      if (add) {
        if (row) {
          row.count += 1;
          row.userReacted = true;
        } else { rows.push({ emoji, count: 1, userReacted: true, },); }
      } else if (row) {
        row.count -= 1;
        row.userReacted = false;
        if (row.count <= 0) { rows.splice(rows.indexOf(row,), 1,); }
      }
    };

    applyToggle(!msg?.reactions?.some((r,) => r.emoji === emoji && r.userReacted),);
    // `showToast` is a ui.ts global (installed via Object.assign on globalThis)
    // shared across suites in a worker — it may be absent or bound to a stub
    // document in tests. Best-effort: the rollback above already landed.
    const notifyFailure = () => {
      try {
        if (typeof showToast === "function") { showToast("error", t("chats.reactionFailed",),); }
      } catch { /* toast is cosmetic; ignore */ }
    };

    try {
      const res = await apiFetch(`/api/v1/messages/${msgId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ emoji, },),
      },);

      if (!res.ok) {
        restore();
        notifyFailure();
        return;
      }

      await this.loadMessageReactions(msgId,);
    } catch {
      restore();
      notifyFailure();
    }
  },
  /**
   * @param {string} msgId
   * @returns {Promise<void>}
   */
  async loadMessageReactions(msgId: string,) {
    try {
      const res = await apiFetch(`/api/v1/messages/${msgId}/reactions`,);
      if (res.ok) {
        const reactions = await res.json();
        const msg = this.messages.find((m,) => m.id === msgId);
        if (msg) { (msg as Message & { reactions?: unknown }).reactions = reactions; }
      }
    } catch {
      // ignore
    }
  },

  /**
   * @returns {Promise<void>}
   */
  async loadAllReactions() {
    if (!this.activeChat || this.messages.length === 0) { return; }
    const ids = Array.from(this.messages, (m,) => m.id,);
    await Promise.allSettled(Array.from(ids, (id,) => this.loadMessageReactions(id,),),);
  },

  /**
   * Refresh the picker row from the server allowlist (`GET quick-emojis`).
   * Defaults stay hardcoded (inline-state/lifecycle) so the picker renders
   * before — or without — this fetch.
   * @returns {Promise<void>}
   */
  async loadQuickEmojis() {
    try {
      const res = await apiFetch(`/api/v1/messages/quick-emojis`,);
      if (!res.ok) { return; }
      const list = (await res.json()) as unknown;
      if (Array.isArray(list,) && list.every((e,) => typeof e === "string")) {
        this._quickEmojis = list as string[];
      }
    } catch {
      // non-critical: keep the hardcoded defaults
    }
  },
};
