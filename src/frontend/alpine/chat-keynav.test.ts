// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-page keynav consumers (epic-accessibility-input Phase 3).
 *
 * The consumers are driven through dispatchKeynavActionToHandlers — the entry
 * point the document keydown listener uses (shortcuts-listener.test.ts covers
 * the key → action mapping and the opt-in flag gate).
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { chatKeynav, } from "./chat-keynav";
import { __resetKeynavHandlersForTests, dispatchKeynavActionToHandlers, } from "./shortcuts";
import type { ChatState, } from "./types";

/** Minimal stand-in for the scrolling #message-list element. */
type FakeList = {
  clientHeight: number;
  scrollTop: number;
  scrolledTo: number[];
  scrollTo(options: { top: number; behavior?: string },): void;
};

/**
 * @param clientHeight - viewport height of the fake list
 * @returns {FakeList}
 */
function makeList(clientHeight = 500,): FakeList {
  const list: FakeList = {
    clientHeight,
    scrollTop: 1000,
    scrolledTo: [],
    scrollTo(options,) {
      list.scrolledTo.push(options.top,);
      list.scrollTop = options.top;
    },
  };

  return list;
}

/** Chat state with the keynav mixin merged in. */
type FakeState = ChatState & { selected: string[] };

/**
 * @param overrides - state fields to override
 * @returns {FakeState}
 */
function makeState(overrides: Record<string, unknown> = {},): FakeState {
  const selected: string[] = [];
  const state = {
    ...chatKeynav,
    chats: [{ id: "c1", }, { id: "c2", }, { id: "c3", },],
    activeChat: "c1",
    filteredChats: [{ id: "c1", }, { id: "c2", }, { id: "c3", },],
    _searchResults: [] as { chatId: string; chatName: string; characterName: string }[],
    selected,
    selectChat: async (chatId: string,) => {
      selected.push(chatId,);
    },
    ...overrides,
  };

  return state as unknown as FakeState;
}

let list: FakeList;

beforeEach(() => {
  list = makeList();
  (document as { querySelector: unknown }).querySelector = (selector: string,) =>
    selector === "#message-list" ? (list as unknown as Element) : null;
},);

afterEach(() => {
  __resetKeynavHandlersForTests();
  (document as { querySelector: unknown }).querySelector = () => null;
},);

describe("chat keynav consumers", () => {
  it("scroll-down scrolls the message list down", () => {
    const state = makeState();
    state.setupKeynav();

    dispatchKeynavActionToHandlers("scroll-down",);

    expect(list.scrolledTo,).toEqual([1400,],);
  });

  it("scroll-up scrolls the message list up", () => {
    const state = makeState();
    state.setupKeynav();

    dispatchKeynavActionToHandlers("scroll-up",);

    expect(list.scrolledTo,).toEqual([600,],);
  });

  it("scrolls nothing when the message list is missing", () => {
    const state = makeState();
    state.setupKeynav();
    (document as { querySelector: unknown }).querySelector = () => null;

    expect(() => dispatchKeynavActionToHandlers("scroll-down",)).not.toThrow();
    expect(list.scrolledTo,).toEqual([],);
  });

  it("next-chat selects the following chat", () => {
    const state = makeState({ activeChat: "c2", },);
    state.setupKeynav();

    dispatchKeynavActionToHandlers("next-chat",);

    expect(state.selected,).toEqual(["c3",],);
  });

  it("prev-chat selects the previous chat", () => {
    const state = makeState({ activeChat: "c2", },);
    state.setupKeynav();

    dispatchKeynavActionToHandlers("prev-chat",);

    expect(state.selected,).toEqual(["c1",],);
  });

  it("next-chat does nothing past the last chat", () => {
    const state = makeState({ activeChat: "c3", },);
    state.setupKeynav();

    dispatchKeynavActionToHandlers("next-chat",);

    expect(state.selected,).toEqual([],);
  });

  it("prev-chat does nothing before the first chat", () => {
    const state = makeState({ activeChat: "c1", },);
    state.setupKeynav();

    dispatchKeynavActionToHandlers("prev-chat",);

    expect(state.selected,).toEqual([],);
  });

  it("next-chat picks the first chat when none is active", () => {
    const state = makeState({ activeChat: null, },);
    state.setupKeynav();

    dispatchKeynavActionToHandlers("next-chat",);

    expect(state.selected,).toEqual(["c1",],);
  });

  it("walks the server-side search results while a search is active", () => {
    const state = makeState({
      activeChat: "c9",
      _searchResults: [
        { chatId: "c9", chatName: "Nine", characterName: "X", },
        { chatId: "c7", chatName: "Seven", characterName: "Y", },
      ],
    },);

    state.setupKeynav();

    dispatchKeynavActionToHandlers("next-chat",);

    expect(state.selected,).toEqual(["c7",],);
  });

  it("teardown removes every consumer", () => {
    const state = makeState();
    state.setupKeynav();
    state.teardownKeynav();

    dispatchKeynavActionToHandlers("scroll-down",);
    dispatchKeynavActionToHandlers("next-chat",);

    expect(list.scrolledTo,).toEqual([],);
    expect(state.selected,).toEqual([],);
  });

  it("re-running setup does not register a second consumer", () => {
    const state = makeState();
    state.setupKeynav();
    state.setupKeynav();

    dispatchKeynavActionToHandlers("scroll-down",);

    expect(list.scrolledTo,).toEqual([1400,],);
  });

  it("a failing chat switch is logged, not thrown", async () => {
    const state = makeState({
      selectChat: async () => {
        throw new Error("boom",);
      },
    },);

    state.setupKeynav();

    expect(() => dispatchKeynavActionToHandlers("next-chat",)).not.toThrow();
    await Promise.resolve();
  });

  it("an action without a consumer does not throw", () => {
    expect(() => dispatchKeynavActionToHandlers("battle-slot-1",)).not.toThrow();
  });
});
