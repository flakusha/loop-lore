// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { awaitChatStateAction, callChatStateAction, } from "./chat-state-global";
import type { ChatPartySplitState, SplitBranchDraft, } from "./chat-types/party-split-state";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, } from "./types";

function uiStore(): Record<string, unknown> | null {
  try {
    return Alpine.store("ui",) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Party split / reunite execution UI (T8 group-chat viewer).
 *
 * The split/reunite engine (`POST /api/chats/:id/split|/reunite`,
 * `src/routes/chats/split.ts`) had zero frontend callers — splits only ran
 * via `/split` + `/reunite` assistant commands. This module backs the modal
 * in `party-split-panel.html`: branch drafts (location + actor set per
 * branch) and the reunite secondary-chat picker.
 *
 * Conflict handling is display-only by design: the engine refuses bad specs
 * with `bad_request` (unknown location, non-participant actor, empty branch,
 * non-owner) and the modal keeps the draft open showing the server message.
 */
export const chatPartySplit: Partial<ChatPartySplitState> & ThisType<ChatState> = {
  splitBranches: [] as SplitBranchDraft[],
  splitBusy: false,
  splitError: null as string | null,
  reuniteSecondaryId: "",
  reuniteBusy: false,
  reuniteError: null as string | null,

  /** @returns {void} */
  openPartySplit() {
    this.splitError = null;
    this.reuniteError = null;
    if (this.splitBranches.length === 0) {
      this.splitBranches = [
        { locationId: "", actorIds: [], name: "", },
        { locationId: "", actorIds: [], name: "", },
      ];
    }

    const store = uiStore();
    if (store) { store.showPartySplit = true; }
  },

  /** @returns {void} */
  closePartySplit() {
    const store = uiStore();
    if (store) { store.showPartySplit = false; }
  },

  /** @returns {void} */
  addSplitBranch() {
    this.splitBranches.push({ locationId: "", actorIds: [], name: "", },);
  },

  /** @param {number} index @returns {void} */
  removeSplitBranch(index: number,) {
    if (this.splitBranches.length <= 2) { return; }
    this.splitBranches.splice(index, 1,);
  },

  /**
   * @param {number} branchIndex
   * @param {string} actorId
   * @returns {void}
   */
  toggleSplitActor(branchIndex: number, actorId: string,) {
    const branch = this.splitBranches[branchIndex];
    if (!branch) { return; }
    const at = branch.actorIds.indexOf(actorId,);
    if (at >= 0) { branch.actorIds.splice(at, 1,); }
    else { branch.actorIds.push(actorId,); }
  },

  /** @returns {Promise<void>} */
  async submitSplit() {
    const chatId = this.activeChat;
    if (!chatId || this.splitBusy) { return; }
    this.splitBusy = true;
    this.splitError = null;
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          branches: this.splitBranches.map((b,) => ({
            locationId: b.locationId.trim(),
            actorIds: b.actorIds,
            ...(b.name.trim() ? { name: b.name.trim(), } : {}),
          })),
        },),
      },);

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        this.splitError = body?.message ?? t("partySplit.failed",);
        return;
      }

      this.splitBranches = [];
      this.closePartySplit();
      this.$dispatch?.("show-toast", { type: "success", message: t("partySplit.splitDone",), },);
      await this.loadMessages?.();
    } catch {
      this.splitError = t("partySplit.failed",);
    } finally {
      this.splitBusy = false;
    }
  },

  /** @returns {Promise<void>} */
  async submitReunite() {
    const chatId = this.activeChat;
    const secondaryChatId = this.reuniteSecondaryId.trim();
    if (!chatId || !secondaryChatId || this.reuniteBusy) { return; }
    this.reuniteBusy = true;
    this.reuniteError = null;
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/reunite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ secondaryChatId, },),
      },);

      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        this.reuniteError = body?.message ?? t("partySplit.failedReunite",);
        return;
      }

      this.reuniteSecondaryId = "";
      this.closePartySplit();
      this.$dispatch?.("show-toast", { type: "success", message: t("partySplit.reunited",), },);
      await this.loadMessages?.();
    } catch {
      this.reuniteError = t("partySplit.failedReunite",);
    } finally {
      this.reuniteBusy = false;
    }
  },
};

const g = globalThis as Record<string, unknown>;
g.openPartySplit = function() {
  callChatStateAction("openPartySplit",);
};

g.closePartySplit = function() {
  callChatStateAction("closePartySplit",);
};

g.submitPartySplit = async function() {
  await awaitChatStateAction("submitSplit",);
};

g.submitPartyReunite = async function() {
  await awaitChatStateAction("submitReunite",);
};
