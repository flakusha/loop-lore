// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Conversation-branch controls (FEAT-047) — header dropdown (list + switch),
 * fork from the message context menu, per-message fork-point indicator,
 * delete + merge. Backed by the FEAT-046 routes under `/api/v1/chats/:id`.
 *
 * `apiFetch` delegates to `feFetch`, which REJECTS on any non-2xx — so every
 * branch action treats "did not throw" as success and funnels failures into
 * one `show-toast` error dispatch.
 */
import { awaitChatStateAction, callChatStateAction, } from "./chat-state-global";
import type { ChatBranchesState, ChatBranchRow, } from "./chat-types/branches-state";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, } from "./types";

/** Envelope the branch routes wrap payloads in: `{ data: … }`. */
interface BranchEnvelope<T,> {
  data?: T;
}

/**
 * `$store.ui` when Alpine is initialized; null during tests/SSR.
 * @returns the ui store or null
 */
function uiStore(): Record<string, unknown> | null {
  if (typeof Alpine === "undefined") { return null; }
  try {
    return Alpine.store("ui",) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** i18n keys for the failure / success toast of one branch mutation. */
interface BranchMutationToasts {
  failed: string;
  done: string;
}

/**
 * One branch mutation under the shared toast contract: `apiFetch` REJECTS on
 * every non-2xx, so a resolved request reloads the list and toasts `done`,
 * while a rejection toasts `failed` and stops without reloading.
 * @param state
 * @param call
 * @param toasts
 * @returns {Promise<void>}
 */
async function mutateBranch(
  state: ChatState,
  call: () => Promise<Response>,
  toasts: BranchMutationToasts,
): Promise<void> {
  try {
    await call();
  } catch {
    state.$dispatch?.("show-toast", { type: "error", message: t(toasts.failed,), },);
    return;
  }
  await state.loadBranches();
  state.$dispatch?.("show-toast", { type: "success", message: t(toasts.done,), },);
}

export const chatBranches: Partial<ChatBranchesState> & ThisType<ChatState> = {
  /** @returns {Promise<void>} */
  async loadBranches() {
    // Capture the target chat up front so a rapid selectChat A→B cannot let a
    // slow A response overwrite B's state (out-of-order fetch race).
    const chatId = this.activeChat;
    if (!chatId) { return; }
    try {
      // The list route is keyset-paginated (default page 20). The dropdown and
      // the panel render `$store.ui.branches` wholesale and have no paging
      // affordance, so ask for the server max in one shot — a branch the user
      // cannot see is a branch they cannot switch to.
      // ponytail: hard ceiling at MAX_PAGE_SIZE (100) branches/chat; add cursor
      // paging to the panel when a chat actually exceeds that.
      const res = await apiFetch(`/api/v1/chats/${chatId}/branches?limit=100`,);
      const body = await res.json() as BranchEnvelope<{ branches?: ChatBranchRow[] }>;
      // Stale-response guard: the user switched chats while this fetch was in flight.
      if (this.activeChat !== chatId) { return; }
      const store = uiStore();
      if (store) { store.branches = body.data?.branches ?? []; }
    } catch {
      if (this.activeChat !== chatId) { return; }
      this.$dispatch?.("show-toast", { type: "error", message: t("branches.failedLoad",), },);
    }
  },

  /**
   * @param messageId
   * @returns {number} branches forked at this message (0 hides the indicator)
   */
  branchCountFor(messageId: string,) {
    const branches = (uiStore()?.branches as ChatBranchRow[] | undefined) ?? [];
    return branches.filter((b,) => b.parentMessageId === messageId).length;
  },

  /**
   * @param messageId
   * @param name
   * @returns {Promise<void>}
   */
  async forkFromMessage(messageId: string, name?: string,) {
    const chatId = this.activeChat;
    if (!chatId || !messageId) { return; }
    const typed = name ?? prompt(t("branches.forkPrompt",),);
    if (typed === null) { return; } // user cancelled the prompt
    const label = typed.trim();
    await mutateBranch(
      this,
      () =>
        apiFetch(`/api/v1/chats/${chatId}/fork`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody(label ? { messageId, name: label, } : { messageId, },),
        },),
      { failed: "branches.failedFork", done: "branches.forked", },
    );
  },

  /**
   * @param branchId
   * @returns {Promise<void>}
   */
  async switchBranch(branchId: string,) {
    const store = uiStore();
    if (store) { store.showBranchMenu = false; }
    const chatId = this.activeChat;
    if (!chatId) { return; }
    await mutateBranch(
      this,
      () =>
        apiFetch(`/api/v1/chats/${chatId}/active-branch`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ branchId, },),
        },),
      { failed: "branches.failedSwitch", done: "branches.switched", },
    );
  },

  /**
   * @param branchId
   * @returns {Promise<void>}
   */
  async deleteBranch(branchId: string,) {
    const chatId = this.activeChat;
    if (!chatId || !branchId) { return; }
    await mutateBranch(
      this,
      () => apiFetch(`/api/v1/chats/${chatId}/branches/${branchId}`, { method: "DELETE", },),
      { failed: "branches.failedDelete", done: "branches.deleted", },
    );
  },

  /**
   * @param branchId
   * @returns {Promise<void>}
   */
  async mergeBranch(branchId: string,) {
    const chatId = this.activeChat;
    if (!chatId || !branchId) { return; }
    await mutateBranch(
      this,
      () =>
        apiFetch(`/api/v1/chats/${chatId}/branches/${branchId}/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({},),
        },),
      { failed: "branches.failedMerge", done: "branches.merged", },
    );
  },

  /** @returns {void} */
  toggleBranches() {
    const store = uiStore();
    if (!store) { return; }
    store.showBranchMenu = !store.showBranchMenu;
    if (store.showBranchMenu) { this.loadBranches(); }
  },
};

// Expose global helpers for the chat-header branches button (the header
// lives outside the chatState x-data scope). Mirrors chat-side-channels.ts.
const g = globalThis as Record<string, unknown>;
g.loadBranches = async function() {
  await awaitChatStateAction("loadBranches",);
};
g.toggleBranches = function() {
  callChatStateAction("toggleBranches",);
};
g.switchBranch = async function(branchId: string,) {
  await awaitChatStateAction("switchBranch", branchId,);
};
g.deleteBranch = async function(branchId: string,) {
  await awaitChatStateAction("deleteBranch", branchId,);
};
g.mergeBranch = async function(branchId: string,) {
  await awaitChatStateAction("mergeBranch", branchId,);
};
g.forkFromMessage = async function(messageId: string, name?: string,) {
  await awaitChatStateAction("forkFromMessage", messageId, name,);
};
g.branchCountFor = function(messageId: string,) {
  return callChatStateAction<number>("branchCountFor", messageId,);
};
