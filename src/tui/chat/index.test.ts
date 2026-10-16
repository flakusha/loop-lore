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
import { afterAll, beforeAll, beforeEach, describe, expect, it, mock, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { CommandListResult, } from "./api";
import type { ChatWidget, } from "./index";
import type { ChatMessage, ChatWidgetOptions, } from "./types";

function makeWidget(): WidgetStub {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const items: string[] = [];
  const keyHandlers: Array<{ keys: unknown; fn: (...args: unknown[]) => void }> = [];
  const state = {
    selectedIndex: -1,
    focusCount: 0,
    renderCount: 0,
    value: "",
    content: "",
    reading: false,
  };

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
    clearValue: () => {
      state.value = "";
    },
    // The chat box arms its own reading: `readInput()` installs the keypress
    // listener and raises `screen.grabKeys`, `releaseInput()` drops both. The
    // stub only records the handover - it never routes a real key, which is
    // exactly why it could not catch the defects this mirrors.
    readInput: () => {
      state.reading = true;
    },
    releaseInput: () => {
      state.reading = false;
    },
    setValue: (v: string,) => {
      state.value = v;
    },
    getValue: () => state.value,
    submit: () => {},
    render: (): void => {
      state.renderCount++;
    },
    setContent: (c: string,) => {
      state.content = c;
    },
    getContent: () => state.content,
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

// The completer reaches the registry through the same module; it only fires
// on a `/` keystroke, so the stub keeps the widget off the network.
const loadCommandsMock = mock(
  (): Promise<CommandListResult> => Promise.resolve({ ok: true, data: [], },),
);

if (ISOLATED) {
  mock.module("./api", () => ({
    API_BASE: "http://test.local",
    handleSend: handleSendMock,
    loadMessages: loadMessagesMock,
    loadCommands: loadCommandsMock,
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
  // The module doubles are shared across the file, so a test that submits a
  // message would otherwise leak call counts into the next one's assertions.
  beforeEach(() => {
    handleSendMock.mockClear();
    loadMessagesMock.mockClear();
    loadCommandsMock.mockClear();
  },);

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
      // Must NOT be `inputOnFocus`: that makes Textarea call `readInput()`,
      // which sets `screen.grabKeys = true`, and `Screen._listenKeys` gates
      // every screen-level key on `!grabKeys` - so every global binding in the
      // TUI went dead while the chat box held focus. Reading is armed by
      // `focusInput()` instead, and released by `releaseInput()`.
      expect(inputOpts.inputOnFocus ?? false,).toBe(false,);
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

  describe("slash-command completion wiring", () => {
    /** The widget's own Tab key handler, whatever it returns. */
    const tabHandler = (chat: ReturnType<typeof buildWidget>,): () => void => {
      const screen = widgetOf(chat, "screen",);
      return (screen.keyHandlers as Array<{ keys: unknown; fn: () => void }>)
        .find((h,) => JSON.stringify(h.keys,) === JSON.stringify(["tab",],))!.fn;
    };

    beforeEach(() => {
      loadCommandsMock.mockResolvedValue({
        ok: true,
        data: [{ name: "reset", descriptionKey: "commands.reset", }, {
          name: "revert",
          descriptionKey: "commands.revert",
        },],
      },);
    },);

    /** Drain the completer's lazy fetch + re-filter microtask chain. */
    const settle = async (): Promise<void> => {
      await new Promise<void>((resolve,) => setTimeout(resolve, 0,));
    };

    /** Type `text` into the input box the way a keystroke does. */
    const type = async (chat: ReturnType<typeof buildWidget>, text: string,): Promise<void> => {
      const input = widgetOf(chat, "inputBox",);
      input.state.value = text;
      input.emit("keypress", text.slice(-1,), { name: text.slice(-1,), },);
      await settle();
    };

    /** The completion strip's rendered content. */
    const strip = (chat: ReturnType<typeof buildWidget>,): string =>
      (chat as unknown as Record<string, WidgetStub>).completionStrip!.getContent();

    it("renders a hint from the live registry once a slash is typed", async () => {
      const chat = buildWidget();
      expect(strip(chat,),).toBe("",);
      await type(chat, "/re",);
      expect(loadCommandsMock,).toHaveBeenCalledTimes(1,);
      expect(strip(chat,),).toContain("reset",);
      expect(strip(chat,),).toContain("revert",);
    });

    it("Tab advances the selection without moving focus away from the input", async () => {
      const chat = buildWidget();
      await type(chat, "/re",);
      expect(strip(chat,),).not.toContain("{bold}",);
      tabHandler(chat,)();
      expect(strip(chat,),).toContain("{bold}",);
      // Focus stayed put: only the startup focus call happened.
      expect(widgetOf(chat, "inputBox",).state.focusCount,).toBe(1,);
    });

    it("Tab falls through to the focus switch when nothing matches", async () => {
      const chat = buildWidget();
      await type(chat, "/zzz",);
      // A no-match query still reports itself, but offers nothing to select.
      expect(strip(chat,),).toContain("no command matches",);
      // The stub does not track focus on its own; real blessed sets it here.
      widgetOf(chat, "screen",).focused = widgetOf(chat, "inputBox",);
      tabHandler(chat,)();
      // The list took focus, so the switch ran instead of the completion.
      expect(widgetOf(chat, "messageList",).state.focusCount,).toBe(1,);
    });

    it("Enter on a highlighted completion commits the text instead of sending", async () => {
      const chat = buildWidget();
      const input = widgetOf(chat, "inputBox",);
      await type(chat, "/re",);
      tabHandler(chat,)();
      input.emit("submit", "/re",);
      expect(input.getValue(),).toBe("/reset ",);
      expect(handleSendMock,).not.toHaveBeenCalled();
    });

    it("a bare slash with no selection still sends as ordinary text", async () => {
      const chat = buildWidget();
      const input = widgetOf(chat, "inputBox",);
      await type(chat, "/",);
      input.emit("submit", "/",);
      expect(handleSendMock,).toHaveBeenCalledWith(chat, "/",);
      expect(input.getValue(),).toBe("",);
    });

    it("a failed registry fetch still sends the slash as ordinary text", async () => {
      loadCommandsMock.mockResolvedValue({ ok: false, error: "HTTP 500", },);
      const chat = buildWidget();
      const input = widgetOf(chat, "inputBox",);
      await type(chat, "/help",);
      // Strip must not be stranded on the loading hint after the failure.
      expect(strip(chat,),).not.toContain("loading",);
      input.emit("submit", "/help",);
      expect(handleSendMock,).toHaveBeenCalledWith(chat, "/help",);
    });
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
  /** Textbox content; the completion tests type into it directly. */
  value: string;
  /** Last content passed to setContent (the completion strip reads this). */
  content: string;
  /** Mirrors `screen.grabKeys` for the chat textbox: true while it reads. */
  reading: boolean;
}

/** Precise shape of the blessed widget stub returned by `makeWidget()`. */
interface WidgetStub {
  on(event: string, fn: (...args: unknown[]) => void,): () => void;
  emit(event: string, ...args: unknown[]): void;
  focus(): void;
  clearValue(): void;
  readInput(): void;
  releaseInput(): void;
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
