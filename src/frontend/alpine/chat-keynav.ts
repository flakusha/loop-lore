// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Keyboard-navigation consumers for the chat page (epic accessibility-input,
 * Phase 3): `j`/`k` scroll the message list, `[`/`]` move through the chat
 * list.
 *
 * The chat list order mirrors what the sidebar shows: server-side search
 * results while a search is active, the client-side filtered list otherwise.
 */
import { $, } from "../dom";
import { log as rootLog, } from "./logger";
import { registerKeynavHandler, } from "./shortcuts";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-keynav", },);

/** The scrolling message list of the chat page. */
const MESSAGE_LIST_SELECTOR = "#message-list";

/** Share of the viewport one j/k step scrolls (the rest stays as context). */
const SCROLL_STEP_RATIO = 0.8;

/** Step used when the container has no measurable height. */
const SCROLL_STEP_FALLBACK_PX = 320;

/** Chat-page keynav wiring (epic-accessibility-input Phase 3). */
export const chatKeynav: Partial<ChatState> & ThisType<ChatState> = {
  _keynavUnsubs: [] as (() => void)[],

  /**
   * Attach the chat-page keynav consumers. The handlers live only while this
   * page is mounted; teardownKeynav removes them again.
   * @returns {void}
   */
  setupKeynav() {
    this.teardownKeynav();
    this._keynavUnsubs = [
      registerKeynavHandler("scroll-down", () => {
        scrollMessageList(1,);
      },),
      registerKeynavHandler("scroll-up", () => {
        scrollMessageList(-1,);
      },),
      registerKeynavHandler("prev-chat", () => {
        switchChat(this, -1,);
      },),
      registerKeynavHandler("next-chat", () => {
        switchChat(this, 1,);
      },),
    ];
  },

  /**
   * Remove every keynav consumer registered by setupKeynav.
   * @returns {void}
   */
  teardownKeynav() {
    for (const unsubscribe of this._keynavUnsubs) { unsubscribe(); }
    this._keynavUnsubs = [];
  },
};

/**
 * Scroll the chat message list one step up or down.
 * @param direction - 1 scrolls down, -1 scrolls up
 * @returns {void}
 */
function scrollMessageList(direction: 1 | -1,): void {
  const list = $<HTMLElement>(MESSAGE_LIST_SELECTOR,);
  if (!list) { return; }

  const step = Math.round(list.clientHeight * SCROLL_STEP_RATIO,) || SCROLL_STEP_FALLBACK_PX;
  list.scrollTo({ top: list.scrollTop + direction * step, behavior: "smooth", },);
}

/**
 * Move to the previous or next chat of the visible chat list.
 * @param state - the chat page state
 * @param offset - 1 selects the next chat, -1 the previous one
 * @returns {void}
 */
function switchChat(state: ChatState, offset: 1 | -1,): void {
  const chatIds = visibleChatIds(state,);
  if (chatIds.length === 0) { return; }

  const current = state.activeChat ? chatIds.indexOf(state.activeChat,) : -1;
  // An active chat outside the list has no neighbour — jump to the end the
  // shortcut points at instead of doing nothing.
  const target = current === -1 ? (offset === 1 ? 0 : chatIds.length - 1) : current + offset;
  if (target < 0 || target >= chatIds.length) { return; }

  const chatId = chatIds[target];
  if (!chatId || chatId === state.activeChat) { return; }

  void state.selectChat(chatId,).catch((error: unknown,) => {
    log.error(
      "chat switch failed",
      error instanceof Error ? error : new Error(String(error,),),
      { chatId, },
    );
  },);
}

/**
 * Chat ids in the order the sidebar lists them.
 * @param state - the chat page state
 * @returns {string[]}
 */
function visibleChatIds(state: ChatState,): string[] {
  if (state._searchResults.length > 0) {
    return state._searchResults.map((result,) => result.chatId);
  }

  return state.filteredChats.map((chat,) => chat.id);
}
