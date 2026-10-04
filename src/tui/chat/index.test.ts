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
import { afterAll, beforeAll, expect, it, mock, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { ChatWidget, } from "./index";
import type { ChatMessage, ChatWidgetOptions, } from "./types";

function makeWidget(): WidgetStub {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const items: string[] = [];
  const keyHandlers: Array<{ keys: unknown; fn: (...args: unknown[]) => void }> = [];
  const state = { selectedIndex: -1, focusCount: 0, renderCount: 0, };
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
    /** Fire a registered event handler (test-side trigger). */
    emit(event: string, ...args: unknown[]): void {
      for (const fn of handlers[event] ?? []) { fn(...args,); }
    },
    focus: (): void => {
      state.focusCount++;
    },
    clearValue: () => {},
    setValue: (_v: string,) => {},
    getValue: () => "",
    submit: () => {},
    render: (): void => {
      state.renderCount++;
    },
    setContent: (_c: string,) => {},
    getContent: () => "",
    add: () => {},
    pushItem: (_line: string,) => {},
    addItem: (line: string,) => {
      items.push(line,);
    },
    popItem: (): string | undefined => items.pop(),
    clearItems: (): void => {
      items.length = 0;
    },
    setItems: (newItems: string[],) => {
      items.length = 0;
      items.push(...newItems,);
    },
    getItemIndex: () => 0,
    select: (idx: number,) => {
      state.selectedIndex = idx;
    },
    selectIndex: (_idx: number,) => {},
    setLabel: (_l: string,) => {},
    key: (keys: unknown, fn: (...args: unknown[]) => void,) => {
      keyHandlers.push({ keys, fn, },);
    },
    hide: () => {},
    show: () => {},
    toggle: () => {},
    items,
    keyHandlers,
    state,
  };
}

const blessedStub = {
  screen: () => ({ ...makeWidget(), append: () => {}, focused: null, }),
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

if (ISOLATED) {
  mock.module("blessed", () => blessedStub,);
}

let ChatWidgetCtor: typeof ChatWidget;
const blessedDefaultExport: Record<string, unknown> = {
  default: blessedStub,
  ...blessedStub,
};

// ── API dispatcher mock ────────────────────────────────────────
// ChatWidget.handleSend/loadMessages delegate to ./api; stub the module so
// delegation is observable without network access.
const handleSendMock = mock(() => Promise.resolve());
const loadMessagesMock = mock(() => Promise.resolve());
if (ISOLATED) {
  mock.module("./api", () => ({
    API_BASE: "http://test.local",
    handleSend: handleSendMock,
    loadMessages: loadMessagesMock,
  }),);
}

if (ISOLATED) {
  mock.module("blessed", () => blessedDefaultExport,);
}

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

function buildWidget(opts: ChatWidgetOptions = {}, screen?: Record<string, unknown>,): ChatWidget {
  // Fresh stub per call — spreading a shared screen would leak render/focus/
  // item state across tests through the copied references.
  const s = screen ?? { ...makeWidget(), append: () => {}, focused: null, };
  return new ChatWidgetCtor(s as never, opts,);
}

function widgetOf(chat: ChatWidget, key: "inputBox" | "messageList" | "screen",): WidgetStub {
  return (chat as unknown as Record<string, WidgetStub>)[key]!;
}

function captureFactory<T extends (...args: unknown[]) => unknown,>(
  fn: T,
): { wrapped: T; calls: Array<Parameters<T>> } {
  const calls: Array<Parameters<T>> = [];
  const wrapped = ((...args: Parameters<T>) => {
    calls.push(args,);
    return fn(...args,);
  }) as T;

  return { wrapped, calls, };
}

// The `mock.module` stubs above only register under ISOLATED; without them
// the real blessed module loads and the widget is not constructible.
describeOrSkip("ChatWidget — sessionToken threading", () => {
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

  it("builds a full-screen box, scrollable list, and bottom input", () => {
    const realBox = blessedStub.box;
    const realList = blessedStub.list;
    const realTextbox = blessedStub.textbox;
    const boxCap = captureFactory(realBox,);
    const listCap = captureFactory(realList,);
    const textboxCap = captureFactory(realTextbox,);
    blessedStub.box = boxCap.wrapped;
    blessedStub.list = listCap.wrapped;
    blessedStub.textbox = textboxCap.wrapped;
    try {
      const chat = buildWidget();
      expect(boxCap.calls,).toHaveLength(1,);
      const boxOpts = (boxCap.calls[0]! as unknown[])[0] as Record<string, unknown>;
      expect(boxOpts.parent,).toBe(widgetOf(chat, "screen",),);
      expect(boxOpts.top,).toBe(0,);
      expect(boxOpts.left,).toBe(0,);
      expect(boxOpts.width,).toBe("100%",);
      expect(boxOpts.height,).toBe("100%",);
      expect(listCap.calls,).toHaveLength(1,);
      const listOpts = (listCap.calls[0]! as unknown[])[0] as Record<string, unknown>;
      expect(listOpts.parent,).toBeDefined();
      expect(listOpts.scrollable,).toBe(true,);
      expect(listOpts.alwaysScroll,).toBe(true,);
      expect(listOpts.tags,).toBe(true,);
      expect(listOpts.height,).toBe("90%-1",);
      expect(textboxCap.calls,).toHaveLength(1,);
      const inputOpts = (textboxCap.calls[0]! as unknown[])[0] as Record<string, unknown>;
      expect(inputOpts.parent,).toBeDefined();
      expect(inputOpts.bottom,).toBe(0,);
      expect(inputOpts.height,).toBe(3,);
      expect(inputOpts.inputOnFocus,).toBe(true,);
      expect(inputOpts.border,).toEqual({ type: "line", fg: 6, },);
    } finally {
      blessedStub.box = realBox;
      blessedStub.list = realList;
      blessedStub.textbox = realTextbox;
    }
  });

  it("focuses the input box on startup", () => {
    const chat = buildWidget();
    expect(widgetOf(chat, "inputBox",).state.focusCount,).toBe(1,);
  });

  it("registers a tab key handler on the screen", () => {
    const chat = buildWidget();
    const keyHandlers = widgetOf(chat, "screen",).keyHandlers as Array<{ keys: unknown }>;
    expect(keyHandlers,).toHaveLength(1,);
    expect(keyHandlers[0]!.keys,).toEqual(["tab",],);
  });

  it("ignores empty and whitespace-only submissions but still clears and refocuses", () => {
    const chat = buildWidget();
    const inputBox = widgetOf(chat, "inputBox",);
    const screen = widgetOf(chat, "screen",);
    inputBox.emit("submit", "",);
    inputBox.emit("submit", "   ",);
    expect(handleSendMock,).not.toHaveBeenCalled();
    expect(inputBox.state.focusCount,).toBe(3,); // startup + 2 submits
    expect(screen.state.renderCount,).toBe(2,);
  });

  it("ignores submissions while a send is in flight, then resumes", () => {
    const chat = buildWidget();
    const inputBox = widgetOf(chat, "inputBox",);
    chat.isSending = true;
    inputBox.emit("submit", "hi",);
    expect(handleSendMock,).not.toHaveBeenCalled();
    chat.isSending = false;
    inputBox.emit("submit", "hi",);
    expect(handleSendMock,).toHaveBeenCalledWith(chat, "hi",);
  });

  it("trims and dispatches a normal submission", () => {
    const chat = buildWidget();
    widgetOf(chat, "inputBox",).emit("submit", "  hello world  ",);
    expect(handleSendMock,).toHaveBeenCalledWith(chat, "hello world",);
  });

  it("moves focus input → list → input", () => {
    const chat = buildWidget();
    const screen = widgetOf(chat, "screen",);
    const inputBox = widgetOf(chat, "inputBox",);
    const list = widgetOf(chat, "messageList",);
    const keyHandlers = screen.keyHandlers as Array<{ fn: () => void }>;
    const tab = keyHandlers[0]!.fn;
    screen.focused = inputBox;
    tab();
    expect(list.state.focusCount,).toBe(1,);
    expect(inputBox.state.focusCount,).toBe(1,);
    screen.focused = null;
    tab();
    expect(inputBox.state.focusCount,).toBe(2,);
    expect(list.state.focusCount,).toBe(1,);
  });

  it("setChatId switches chat, resets cursor, clears messages, notifies listener", () => {
    const seen: string[] = [];
    const chat = buildWidget({
      onChatChange: (id,) => {
        seen.push(id,);
      },
    },);

    chat.cursor = "cursor-abc";
    chat.setChatId("chat-1",);
    expect(chat.getChatId(),).toBe("chat-1",);
    expect(chat.cursor,).toBeNull();
    expect(chat.itemCount,).toBe(0,);
    expect(seen,).toEqual(["chat-1",],);
  });

  it("getChatId is null before any selection", () => {
    const chat = buildWidget();
    expect(chat.getChatId(),).toBeNull();
  });

  it("setSessionToken updates the token", () => {
    const chat = buildWidget();
    chat.setSessionToken("tok-1",);
    expect(chat.sessionToken,).toBe("tok-1",);
  });

  it("addMessage appends a formatted line, counts it, and selects it", () => {
    const chat = buildWidget();
    const msg: ChatMessage = { id: "m1", role: "user", content: "hello", };
    chat.addMessage(msg,);
    expect(chat.messages,).toEqual([msg,],);
    expect(chat.itemCount,).toBe(1,);
    const list = widgetOf(chat, "messageList",);
    expect(list.items,).toEqual(["{bold}user{/bold}: hello",],);
    expect(list.state.selectedIndex,).toBe(0,);
    expect(widgetOf(chat, "screen",).state.renderCount,).toBe(1,);
  });

  it("addMessage prefers actorName over role in the prefix", () => {
    const chat = buildWidget();
    chat.addMessage({ id: "m2", role: "assistant", content: "hi", actorName: "Alice", },);
    expect(widgetOf(chat, "messageList",).items,).toEqual(["{bold}Alice{/bold}: hi",],);
  });

  it("addMessage truncates content beyond 200 chars", () => {
    const chat = buildWidget();
    chat.addMessage({ id: "m3", role: "user", content: "x".repeat(250,), },);
    expect(widgetOf(chat, "messageList",).items,).toEqual([`{bold}user{/bold}: ${"x".repeat(200,)}...`,],);
  });

  it("setMessages replaces the list and selects the last item", () => {
    const chat = buildWidget();
    const m1: ChatMessage = { id: "1", role: "user", content: "one", };
    const m2: ChatMessage = { id: "2", role: "assistant", content: "two", };
    chat.setMessages([m1, m2,],);
    expect(chat.messages,).toEqual([m1, m2,],);
    expect(chat.itemCount,).toBe(2,);
    const list = widgetOf(chat, "messageList",);
    expect(list.items,).toEqual(["{bold}user{/bold}: one", "{bold}assistant{/bold}: two",],);
    expect(list.state.selectedIndex,).toBe(1,);
  });

  it("setMessages with an empty list clears items without selecting", () => {
    const chat = buildWidget();
    chat.setMessages([],);
    expect(chat.itemCount,).toBe(0,);
    const list = widgetOf(chat, "messageList",);
    expect(list.items,).toEqual([],);
    expect(list.state.selectedIndex,).toBe(-1,);
  });

  it("clearMessages empties messages, items, and the counter", () => {
    const chat = buildWidget();
    chat.addMessage({ id: "m1", role: "user", content: "hello", },);
    chat.clearMessages();
    expect(chat.messages,).toEqual([],);
    expect(chat.itemCount,).toBe(0,);
    expect(widgetOf(chat, "messageList",).items,).toEqual([],);
  });

  it("scrollToBottom on an empty list renders without selecting", () => {
    const chat = buildWidget();
    const screen = widgetOf(chat, "screen",);
    chat.scrollToBottom();
    expect(screen.state.renderCount,).toBe(1,);
    expect(widgetOf(chat, "messageList",).state.selectedIndex,).toBe(-1,);
  });

  it("showTyping appends a placeholder and selects it", () => {
    const chat = buildWidget();
    chat.showTyping();
    expect(chat.itemCount,).toBe(1,);
    const list = widgetOf(chat, "messageList",);
    expect(list.items,).toEqual(["{italic}{yellow}... typing{/yellow}{/italic}",],);
    expect(list.state.selectedIndex,).toBe(0,);
  });

  it("hideTyping removes the placeholder", () => {
    const chat = buildWidget();
    chat.showTyping();
    chat.hideTyping();
    expect(chat.itemCount,).toBe(0,);
    expect(widgetOf(chat, "messageList",).items,).toEqual([],);
  });

  it("hideTyping on an empty list is a no-op that still renders", () => {
    const chat = buildWidget();
    const screen = widgetOf(chat, "screen",);
    chat.hideTyping();
    expect(chat.itemCount,).toBe(0,);
    expect(widgetOf(chat, "messageList",).items,).toEqual([],);
    expect(screen.state.renderCount,).toBe(1,);
  });

  it("showError appends a red error line and scrolls", () => {
    const chat = buildWidget();
    const screen = widgetOf(chat, "screen",);
    chat.showError("boom",);
    const list = widgetOf(chat, "messageList",);
    expect(list.items,).toEqual(["{red-fg}⚠ Error: boom{/red-fg}",],);
    // scrollToBottom renders; itemCount is not bumped by showError (see report).
    expect(screen.state.renderCount,).toBe(1,);
  });

  it("handleSend delegates to the api dispatcher with widget and text", async () => {
    const chat = buildWidget();
    await chat.handleSend("hello",);
    expect(handleSendMock,).toHaveBeenCalledWith(chat, "hello",);
  });

  it("loadMessages delegates to the api dispatcher with widget", async () => {
    const chat = buildWidget();
    await chat.loadMessages();
    expect(loadMessagesMock,).toHaveBeenCalledWith(chat,);
  });
},);

/** Stubbed widget API surface — minimal methods ChatWidget touches at
 * construction + initial wiring (on, focus, render, key, clearValue, ...).
 * The string-keyed `Record` keeps the event handler list cheap and stable. */
/** Precise state bag shared by the widget stub and its consumers. */
interface WidgetState {
  selectedIndex: number;
  focusCount: number;
  renderCount: number;
}

/** Precise shape of the blessed widget stub returned by `makeWidget()`. */
interface WidgetStub {
  on(event: string, fn: (...args: unknown[]) => void,): () => void;
  emit(event: string, ...args: unknown[]): void;
  focus(): void;
  clearValue(): void;
  setValue(v: string,): void;
  getValue(): string;
  submit(): void;
  render(): void;
  setContent(c: string,): void;
  getContent(): string;
  add(): void;
  pushItem(line: string,): void;
  addItem(line: string,): void;
  popItem(): string | undefined;
  clearItems(): void;
  setItems(newItems: string[],): void;
  getItemIndex(): number;
  select(idx: number,): void;
  selectIndex(idx: number,): void;
  setLabel(l: string,): void;
  key(keys: unknown, fn: (...args: unknown[]) => void,): void;
  hide(): void;
  show(): void;
  toggle(): void;
  items: string[];
  keyHandlers: Array<{ keys: unknown; fn: (...args: unknown[]) => void }>;
  state: WidgetState;
  focused?: WidgetStub | null;
}
