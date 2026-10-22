// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Poll methods for chat messages (TASK-message-polls-votes).
 *
 * Extracted from chat-messages.ts to keep the main file under the 250L limit.
 * Methods are merged into the chatMessages object at call time, so `this`
 * still resolves to the full ChatState. Votes update `msg.poll` in place —
 * no full message-list re-render.
 */
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, Message, MessagePoll, } from "./types";

/** Poll composer draft for the inline create-poll form. */
interface PollDraft {
  messageId: string;
  question: string;
  optionsText: string;
  multi: boolean;
}

/** Parse the composer's one-option-per-line textarea (max 10, non-empty). */
function parseDraftOptions(optionsText: string,): string[] {
  return optionsText
    .split("\n",)
    .map((line,) => line.trim())
    .filter((line,) => line.length > 0)
    .slice(0, 10,);
}

/** Attach a poll snapshot to its message in place (no list re-render). */
function attachPoll(messages: Message[], poll: MessagePoll,): void {
  const msg = messages.find((m,) => m.id === poll.messageId) as
    | (Message & { poll?: MessagePoll })
    | undefined;

  if (msg) { msg.poll = poll; }
}

export const chatPollMethods: Partial<ChatState> & ThisType<ChatState> = {
  /** */
  _pollComposer: null as PollDraft | null,

  /**
   * Open the inline poll composer on a message.
   * @param {string} msgId
   */
  openPollComposer(msgId: string,) {
    this._pollComposer = { messageId: msgId, question: "", optionsText: "", multi: false, };
  },

  /** Close the inline poll composer without creating. */
  closePollComposer() {
    this._pollComposer = null;
  },

  /**
   * Create the poll attached to a message from the composer draft.
   * @returns {Promise<void>}
   */
  async createMessagePoll() {
    const draft = this._pollComposer;
    if (!draft || !this.activeChat) { return; }
    const options = parseDraftOptions(draft.optionsText,);
    if (draft.question.trim().length === 0 || options.length < 2) {
      globalThis.showToast?.(t("chats.pollInvalidInput",), "error",);
      return;
    }

    try {
      const res = await apiFetch(`/api/v1/messages/${draft.messageId}/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          question: draft.question.trim(),
          options,
          multi: draft.multi,
        },),
      },);

      if (!res.ok) {
        globalThis.showToast?.(t("chats.pollFailed",), "error",);
        return;
      }

      const poll = (await res.json()) as MessagePoll;
      attachPoll(this.messages, poll,);
      this._pollComposer = null;
    } catch {
      globalThis.showToast?.(t("chats.pollFailed",), "error",);
    }
  },

  /**
   * Load all polls in the active chat and attach them to their messages.
   * @returns {Promise<void>}
   */
  async loadChatPolls() {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/polls`,);
      if (!res.ok) { return; }
      const polls = (await res.json()) as MessagePoll[];
      if (!Array.isArray(polls,)) { return; }
      for (const poll of polls) { attachPoll(this.messages, poll,); }
    } catch {
      // non-critical
    }
  },

  /**
   * Vote on a message poll (replaces single-choice votes, adds multi votes).
   * @param {string} msgId
   * @param {number} optionIdx
   * @returns {Promise<void>}
   */
  async votePollOption(msgId: string, optionIdx: number,) {
    const msg = this.messages.find((m,) => m.id === msgId);
    if (!msg?.poll || msg.poll.closed) { return; }
    try {
      const res = await apiFetch(`/api/v1/messages/${msgId}/poll/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ optionIdx, },),
      },);

      if (!res.ok) {
        globalThis.showToast?.(t("chats.pollFailed",), "error",);
        return;
      }

      attachPoll(this.messages, (await res.json()) as MessagePoll,);
    } catch {
      globalThis.showToast?.(t("chats.pollFailed",), "error",);
    }
  },

  /**
   * Close a poll (creator, chat owner, or admin; server enforces).
   * @param {string} msgId
   * @returns {Promise<void>}
   */
  async closeMessagePoll(msgId: string,) {
    try {
      const res = await apiFetch(`/api/v1/messages/${msgId}/poll/close`, {
        method: "POST",
      },);

      if (!res.ok) {
        globalThis.showToast?.(t("chats.pollFailed",), "error",);
        return;
      }

      attachPoll(this.messages, (await res.json()) as MessagePoll,);
    } catch {
      globalThis.showToast?.(t("chats.pollFailed",), "error",);
    }
  },

  /**
   * Attach a poll snapshot to its message in place.
   * @param {MessagePoll} poll
   */
  applyPoll(poll: MessagePoll,) {
    attachPoll(this.messages, poll,);
  },
};
