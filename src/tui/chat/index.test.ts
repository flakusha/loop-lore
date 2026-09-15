// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/chat/index.ts — ChatWidget.sessionToken threading.
 *
 * The TUI app constructs ChatWidget via `new ChatWidget(screen, options)` and
 * passes `options.sessionToken` straight through to the request layer for
 * Bearer auth. These tests cover the three contract points:
 *
 *   1. Explicit string is forwarded verbatim.
 *   2. Omitted sessionToken stays undefined (anonymous mode for solo).
 *   3. Empty string is normalized to undefined so a stray `""` from TOML
 *      doesn't ship as a Bearer header and trip a 401.
 *
 * `blessed` is stubbed via `mock.module` — the real implementation opens a
 * terminal and crashes outside a TTY. The dynamic import inside beforeAll is
 * required: bun's `mock.module` replaces the resolution table only for modules
 * imported after the stub registers, so the typed static imports above are
 * intentional blanks and the real symbol arrives through the dynamic seam.
 */
import { afterAll, beforeAll, describe, expect, it, mock, } from "bun:test";
import type { ChatWidget, } from "./index";
import type { ChatWidgetOptions, } from "./types";

/** Stubbed widget API surface — minimal methods ChatWidget touches at
 * construction + initial wiring (on, focus, render, key, clearValue, ...).
 * The string-keyed `Record` keeps the event handler list cheap and stable. */
function makeWidget(): Record<string, unknown> {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    on(event: string, fn: (...args: unknown[]) => void,): () => void {
      let list = handlers[event];
      if (!list) { list = handlers[event] = []; }
      list.push(fn,);
      return () => {
        const idx = list.indexOf(fn,);
        if (idx >= 0) { list.splice(idx, 1,); }
      };
    },
    focus: () => {},
    clearValue: () => {},
    setValue: (_v: string,) => {},
    getValue: () => "",
    submit: () => {},
    render: () => {},
    setContent: (_c: string,) => {},
    getContent: () => "",
    add: () => {},
    pushItem: (_line: string,) => {},
    clearItems: () => {},
    setItems: (_items: string[],) => {},
    getItemIndex: () => 0,
    select: (_idx: number,) => {},
    selectIndex: (_idx: number,) => {},
    setLabel: (_l: string,) => {},
    key: (..._args: unknown[]) => {},
    hide: () => {},
    show: () => {},
    toggle: () => {},
  };
}

const screenBase = makeWidget();

const blessedStub = {
  screen: () => ({ ...screenBase, append: () => {}, focused: null, }),
  box: () => makeWidget(),
  list: () => makeWidget(),
  text: () => makeWidget(),
  textbox: () => makeWidget(),
  button: () => makeWidget(),
  progressBar: () => makeWidget(),
  message: () => makeWidget(),
  prompt: () => makeWidget(),
  input: () => makeWidget(),
  checkbox: () => makeWidget(),
  radio: () => makeWidget(),
  radioSet: () => makeWidget(),
  form: () => makeWidget(),
  textarea: () => makeWidget(),
  scrollableText: () => makeWidget(),
  bigtext: () => makeWidget(),
  layout: () => makeWidget(),
};

mock.module("blessed", () => blessedStub,);

let ChatWidgetCtor: typeof ChatWidget;
const blessedDefaultExport: Record<string, unknown> = {
  default: blessedStub,
  ...blessedStub,
};
mock.module("blessed", () => blessedDefaultExport,);
beforeAll(async () => {
  // Dynamic import required: bun's mock.module replaces the resolution table
  // only for modules imported after the stub registers; the static type-only
  // imports above are erased at runtime.
  ChatWidgetCtor = (await import("./index")).ChatWidget;
},);

afterAll(() => {
  // No public unmock in bun; the test runs under the isolated gate so other
  // suites never see this stub.
},);

function buildWidget(opts: ChatWidgetOptions = {},): ChatWidget {
  return new ChatWidgetCtor({ ...screenBase, append: () => {}, focused: null, } as never, opts,);
}

describe("ChatWidget — sessionToken threading", () => {
  it("forwards an explicit sessionToken onto the instance", () => {
    const chat = buildWidget({ sessionToken: "abc123", },);
    expect(chat.sessionToken,).toBe("abc123",);
  });

  it("leaves sessionToken undefined when omitted", () => {
    const chat = buildWidget({},);
    expect(chat.sessionToken,).toBeUndefined();
  });

  it("normalizes an empty-string sessionToken to undefined", () => {
    const chat = buildWidget({ sessionToken: "", },);
    expect(chat.sessionToken,).toBeUndefined();
  });
});
