// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * showError() must keep itemCount in step with the message list. The
 * existing api.test.ts stubs showError out entirely, so nothing covered the
 * real method — and it was the one append site that forgot the increment,
 * leaving scrollToBottom() selecting the wrong line.
 * BUG-tui-showerror-desyncs-itemcount-from-messagelist-length.
 *
 * Blessed is never instantiated: ChatWidget's constructor builds real
 * widgets, so the test drives the prototype methods against a hand-rolled
 * object that supplies only the fields those methods touch.
 */
import { describe, expect, it, } from "bun:test";
import { ChatWidget, } from "./index";
import type { ChatMessage, } from "./types";

interface ListStub {
  items: string[];
  selected: number | null;
}

interface Harness {
  widget: ChatWidget;
  list: ListStub;
}

/** Drive the real prototype methods against stubbed blessed fields. */
function makeHarness(): Harness {
  const list: ListStub = { items: [], selected: null, };
  const messageList = {
    addItem: (line: string,) => {
      list.items.push(line,);
    },
    setItems: (lines: string[],) => {
      list.items = [...lines,];
    },
    clearItems: () => {
      list.items = [];
    },
    popItem: () => {
      list.items.pop();
    },
    select: (i: number,) => {
      list.selected = i;
    },
  };

  // The methods under test only read/write itemCount, messageList and
  // screen.render, so a prototype-backed object with just those fields is
  // enough — no constructor, no real terminal.
  const widget = Object.create(ChatWidget.prototype,) as ChatWidget;
  Object.assign(widget, {
    itemCount: 0,
    messages: [],
    messageList,
    screen: { render: () => {}, },
  },);

  return { widget, list, };
}

describe("showError itemCount bookkeeping", () => {
  it("increments itemCount so scrollToBottom selects the error line", () => {
    const { widget, list, } = makeHarness();
    widget.showError("boom",);

    expect(widget.itemCount,).toBe(1,);
    expect(list.items.length,).toBe(1,);
  });

  it("stays in step across repeated errors", () => {
    const { widget, list, } = makeHarness();
    widget.showError("first",);
    widget.showError("second",);
    widget.showError("third",);

    expect(widget.itemCount,).toBe(list.items.length,);
    expect(widget.itemCount,).toBe(3,);
  });

  it("counts errors alongside added messages", () => {
    // The desync was only visible in a mix: addMessage and showTyping both
    // incremented, so the error path was the sole source of drift.
    const { widget, list, } = makeHarness();
    const msg: ChatMessage = { id: "m1", role: "user", content: "hi", };
    widget.addMessage(msg,);
    widget.showError("boom",);
    widget.showError("still broken",);

    expect(widget.itemCount,).toBe(list.items.length,);
    expect(widget.itemCount,).toBe(3,);
  });
});
