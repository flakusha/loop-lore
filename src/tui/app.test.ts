// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/app.ts — the TUI shell: shortcut dispatch, the F2 asset and
 * F3 harness toggles, resize repaint, and shutdown.
 *
 * `blessed` is stubbed via `mock.module` for the same reason chat/index.test.ts
 * stubs it: the real implementation opens a terminal and blocks on terminal
 * events outside a TTY. The static `import type` above is erased at runtime and
 * the real symbols arrive through the dynamic imports in `beforeAll` — bun's
 * `mock.module` rewrites the resolution table only for modules imported after
 * the stub registers.
 *
 * The stub is faithful where production code depends on it: `visible` mirrors
 * blessed's `hidden` option and is flipped by `show()`/`hide()`, so the toggle
 * double-press idempotence is exercised rather than assumed.
 */
import { afterEach, beforeAll, beforeEach, expect, it, mock, spyOn, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";
import type { safeFetch, } from "../utils";
import type { FetchResult, } from "../utils/safe-fetch/types";
import type { TUIApp, } from "./app";

type Handler = (...args: never[]) => void;

/** Widget stub — the union of the blessed surface the TUI widgets touch. */
interface WidgetStub {
  visible: boolean;
  content: string;
  items: string[];
  destroyed: boolean;
  renderCount: number;
  keyHandlers: Array<{ keys: string[]; fn: Handler }>;
  on(event: string, fn: Handler,): void;
  emit(event: string, ...args: unknown[]): void;
  key(keys: string[], fn: Handler,): void;
  render(): void;
  setContent(content: string,): void;
  show(): void;
  hide(): void;
  focus(): void;
  destroy(): void;
  clearValue(): void;
  getValue(): string;
  setValue(_value: string,): void;
  submit(): void;
  clearItems(): void;
  add(item: string,): void;
  addItem(item: string,): void;
  setItems(items: string[],): void;
  select(_index: number,): void;
}

/** Blessed factory options — only the field the stub reads. */
interface WidgetOpts {
  hidden?: boolean;
}

/** Text widgets created per test, in creation order; never reset by mock(). */
const textWidgets: WidgetStub[] = [];
/** blessed.screen() calls, counted across the module import and every test. */
let screenCreations = 0;

function makeWidget(opts: WidgetOpts = {},): WidgetStub {
  const handlers = new Map<string, Handler[]>();
  const widget: WidgetStub = {
    // blessed seeds `visible` from the `hidden` option; AssetView and
    // HarnessView branch on it, so the stub has to agree or every toggle
    // takes the same path and the tests would pass against a broken widget.
    visible: !opts.hidden,
    content: "",
    items: [],
    destroyed: false,
    renderCount: 0,
    keyHandlers: [],
    on(event, fn,) {
      handlers.set(event, [...handlers.get(event,) ?? [], fn,],);
    },
    emit(event, ...args) {
      for (const fn of handlers.get(event,) ?? []) {
        (fn as unknown as (...a: unknown[]) => void)(...args,);
      }
    },
    key(keys, fn,) {
      widget.keyHandlers.push({ keys, fn, },);
    },
    render() {
      widget.renderCount++;
    },
    setContent(content,) {
      widget.content = content;
    },
    show() {
      widget.visible = true;
    },
    hide() {
      widget.visible = false;
    },
    focus() {},
    destroy() {
      widget.destroyed = true;
    },
    clearValue() {},
    getValue() {
      return "";
    },
    setValue(_value,) {},
    submit() {},
    clearItems() {
      widget.items = [];
    },
    add(item,) {
      widget.items.push(item,);
    },
    addItem(item,) {
      widget.items.push(item,);
    },
    setItems(items,) {
      widget.items = [...items,];
    },
    select(_index,) {},
  };

  return widget;
}

const blessedStub = {
  screen: () => {
    screenCreations++;
    // Object.assign, not a spread: the stub methods close over the widget they
    // were built on, so a spread copy would never see its own render counts.
    return Object.assign(makeWidget(), { append: () => {}, focused: null, },);
  },
  box: (opts: WidgetOpts = {},) => makeWidget(opts,),
  list: (opts: WidgetOpts = {},) => makeWidget(opts,),
  text: (opts: WidgetOpts = {},) => {
    const widget = makeWidget(opts,);
    textWidgets.push(widget,);
    return widget;
  },
  textbox: (opts: WidgetOpts = {},) => makeWidget(opts,),
};

if (ISOLATED) {
  mock.module("blessed", () => ({ default: blessedStub, ...blessedStub, }),);
}

// ── Config double ────────────────────────────────────────────────────────
// `loadConfig` reads the repo config off disk; the shell's contract is only
// "take the token when the config loads, run anonymous when it throws".
let configError: Error | null = null;
let configToken: string | undefined = "test-token";
if (ISOLATED) {
  mock.module("../config/load", () => ({
    loadConfig: (): unknown => {
      if (configError) { throw configError; }
      return { tui: { sessionToken: configToken, }, };
    },
  }),);
}

let createTUIApp: () => TUIApp;
let setFetch: (fn: typeof safeFetch,) => void;
let realFetch: typeof safeFetch;
/** blessed.screen() calls consumed by the module import itself. */
let screensAtImport: number;
let exitSpy: ReturnType<typeof spyOn> | null = null;

beforeAll(async () => {
  // Dynamic import required: `mock.module` replaces the resolution table only
  // for modules imported after the stub registers.
  createTUIApp = (await import("./app")).createTUIApp;
  setFetch = (await import("./harness/api")).setFetch;
  realFetch = (await import("../utils")).safeFetch;
  screensAtImport = screenCreations;
},);

beforeEach(() => {
  configError = null;
  configToken = "test-token";
  textWidgets.length = 0;
  // HarnessView.toggle() fires `void this.refresh()`, which fetches the runs
  // list. Without this stub an F3 press opens a real socket to localhost.
  const emptyRuns = async <T,>(): Promise<
    FetchResult<T>
  > => ({ ok: true, data: { items: [], }, status: 200, headers: new Headers(), } as FetchResult<T>);

  setFetch(emptyRuns as unknown as typeof safeFetch,);
},);

afterEach(() => {
  exitSpy?.mockRestore();
  exitSpy = null;
  // Per-test rather than once in `afterAll`: a failing test must not leave
  // its fetch stub installed for everything that runs after it.
  setFetch(realFetch,);
},);

/** Fire every screen-level `key` handler bound to `name` — how blessed fans out. */
function pressKey(app: TUIApp, name: string,): void {
  const screen = app.screen as unknown as WidgetStub;
  for (const { keys, fn, } of screen.keyHandlers) {
    if (keys.includes(name,)) {
      (fn as unknown as (...a: unknown[]) => void)(name, { name, },);
    }
  }
}

/** The status bar is the text widget `updateStatus` writes the app name into. */
function statusBar(): WidgetStub {
  const bar = textWidgets.find((w,) => w.content.includes("Loop Lore",));
  if (!bar) { throw new Error("status bar not created — updateStatus never ran",); }
  return bar;
}

/** Drain the fire-and-forget promise chains the F3/F5 handlers spawn. */
async function flushMicrotasks(): Promise<void> {
  for (let tick = 0; tick < 100; tick++) { await Promise.resolve(); }
}

// The `mock.module` stubs only register under ISOLATED; without them the real
// blessed module loads and the shell is not constructible.
describeOrSkip("TUIApp", () => {
  it("builds no screen until createTUIApp is called", () => {
    expect(screensAtImport,).toBe(0,);
  });

  it("builds exactly one screen per createTUIApp call", () => {
    const before = screenCreations;
    createTUIApp();
    expect(screenCreations - before,).toBe(1,);
  });

  it("threads the config session token into the chat widget", () => {
    expect(createTUIApp().chat.sessionToken,).toBe("test-token",);
  });

  it("runs anonymous when the config fails to load", () => {
    configError = new Error("no config.toml",);
    expect(createTUIApp().chat.sessionToken,).toBeUndefined();
  });

  it("paints the ready hint on the status bar", () => {
    createTUIApp();
    expect(statusBar().content,).toContain("F2: assets | F3: harness",);
  });

  it("repaints the screen on resize", () => {
    const app = createTUIApp();
    const screen = app.screen as unknown as WidgetStub;
    const before = screen.renderCount;
    screen.emit("resize",);
    expect(screen.renderCount,).toBeGreaterThan(before,);
  });

  // The resize test above cannot see updateStatus's repaint: the resize
  // handler renders on its own, so `toBeGreaterThan` across the emit stays
  // green with updateStatus's `this.screen.render()` deleted. This one counts
  // renders across a status change instead, with F2's `assets.toggle()` — which
  // renders by way of show()/hide() — stubbed out, so the only thing that can
  // move renderCount is updateStatus itself. Verified by mutation: deleting
  // app.ts:136 drops this to 0 renders and the suite goes red.
  it("repaints the screen on a status change", () => {
    const app = createTUIApp();
    const screen = app.screen as unknown as WidgetStub;
    spyOn(app.assets, "toggle",).mockImplementation(() => {},);
    const before = screen.renderCount;

    pressKey(app, "f2",);

    expect(statusBar().content,).toContain("Assets:",);
    expect(screen.renderCount - before,).toBe(1,);
  });

  // Drives the `onChatChange` closure the shell hands the ChatWidget
  // constructor. ChatWidget keeps it in a private field and fires it only from
  // setChatId, so reaching for it on the instance is the honest way in —
  // stubbing the whole ./chat module would cost the session-token and
  // message-list doubles the other tests read. Both fetch chains the callback
  // fans out to are stubbed, so the test stays offline and its assertions land
  // on what the closure did rather than on what it was handed.
  it("re-points the status bar and asset view at the chat a change reports", async () => {
    const app = createTUIApp();
    // Unchecked cast: onChatChange is private on ChatWidget; this reads the
    // exact function the app.ts constructor supplied.
    const chat = app.chat as unknown as { onChatChange?: (chatId: string,) => void };
    const onChatChange = chat.onChatChange;
    if (!onChatChange) { throw new Error("shell wired no onChatChange into the ChatWidget",); }
    spyOn(app.assets, "loadAssets",).mockResolvedValue(undefined,);
    const loadMessages = spyOn(app.chat, "loadMessages",).mockResolvedValue(undefined,);

    onChatChange("0123456789abcdef",);
    await flushMicrotasks();

    expect(app.assets.getChatId(),).toBe("0123456789abcdef",);
    expect(statusBar().content,).toContain("chat: 01234567...",);
    expect(loadMessages,).toHaveBeenCalledTimes(1,);
  });

  it("toggles the asset sidebar with F2 and back off the next press", () => {
    const app = createTUIApp();
    expect(app.assets.isVisible(),).toBe(false,);

    pressKey(app, "f2",);
    expect(app.assets.isVisible(),).toBe(true,);
    expect(statusBar().content,).toContain("Assets: visible",);

    pressKey(app, "f2",);
    expect(app.assets.isVisible(),).toBe(false,);
    expect(statusBar().content,).toContain("Assets: hidden",);
  });

  it("leaves the asset sidebar hidden after a double F2 press", () => {
    const app = createTUIApp();
    pressKey(app, "f2",);
    pressKey(app, "f2",);
    expect(app.assets.isVisible(),).toBe(false,);
  });

  it("toggles the harness overlay with F3 and back off the next press", () => {
    const app = createTUIApp();
    expect(app.harness.isVisible(),).toBe(false,);

    pressKey(app, "f3",);
    expect(app.harness.isVisible(),).toBe(true,);
    expect(statusBar().content,).toContain("Harness: visible",);

    pressKey(app, "f3",);
    expect(app.harness.isVisible(),).toBe(false,);
    expect(statusBar().content,).toContain("Harness: hidden",);
  });

  it("leaves the harness overlay hidden after a double F3 press", () => {
    const app = createTUIApp();
    pressKey(app, "f3",);
    pressKey(app, "f3",);
    expect(app.harness.isVisible(),).toBe(false,);
  });

  it("keeps the F2 and F3 toggles independent", () => {
    const app = createTUIApp();
    pressKey(app, "f2",);
    pressKey(app, "f3",);
    expect([app.assets.isVisible(), app.harness.isVisible(),],).toEqual([true, true,],);
  });

  it("clears the message list on Ctrl+L", () => {
    const app = createTUIApp();
    (app.chat as unknown as { messageList: WidgetStub }).messageList.addItem("stale line",);

    pressKey(app, "C-l",);
    expect(app.chat.messages,).toEqual([],);
    expect(statusBar().content,).toContain("display cleared",);
  });

  it("reports no active chat when F5 is pressed with no chat selected", async () => {
    const app = createTUIApp();

    pressKey(app, "f5",);
    await flushMicrotasks();
    expect(statusBar().content,).toContain("no active chat",);
  });

  it("refreshes the message list on F5 and echoes the chat id", async () => {
    const app = createTUIApp();
    const loadMessages = spyOn(app.chat, "loadMessages",).mockResolvedValue(undefined,);
    // `chatId` is a public field; assigning it directly skips `setChatId`,
    // which would fire the onChatChange fetch chain instead.
    app.chat.chatId = "abcdefgh-1234";

    pressKey(app, "f5",);
    await flushMicrotasks();

    expect(loadMessages,).toHaveBeenCalledTimes(1,);
    expect(statusBar().content,).toContain("chat: abcdefgh...",);
  });

  it("surfaces a failed F5 refresh instead of crashing", async () => {
    const app = createTUIApp();
    const loadMessages = spyOn(app.chat, "loadMessages",).mockRejectedValue(
      new Error("server down",),
    );

    app.chat.chatId = "abcdefgh-1234";

    pressKey(app, "f5",);
    await flushMicrotasks();

    expect(loadMessages,).toHaveBeenCalledTimes(1,);
    expect(statusBar().content,).toContain("load failed",);
  });

  // Parameterized over ALL THREE names on the quit binding. A single-case
  // version silently accepts dropping `q` or `C-c` from the array — verified by
  // mutation: narrowing the binding to escape alone left the suite green.
  for (const quitKey of ["escape", "q", "C-c",]) {
    it(`destroys the screen and exits on ${quitKey}`, () => {
      const app = createTUIApp();
      exitSpy = spyOn(process, "exit",).mockImplementation((() => {}) as never,);

      pressKey(app, quitKey,);
      expect((app.screen as unknown as WidgetStub).destroyed,).toBe(true,);
      expect(exitSpy,).toHaveBeenCalledWith(0,);
    });
  }
},);
