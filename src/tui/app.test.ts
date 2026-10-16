// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/app.ts — the TUI shell: construction (screen-per-call, config
 * session-token threading, anonymous fallback), shortcut dispatch, the F2 asset
 * and F3 harness toggles, resize and status-change repaint, the F5 refresh
 * chain, the chat-change re-point, and shutdown.
 *
 * The two repaint tests are separate on purpose: the resize test cannot see
 * updateStatus's render (the resize handler renders on its own), so the
 * status-change test counts renders with the toggle's own show()/hide()
 * renders stubbed out.
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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { setGlobalLogger, } from "../logger";
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

/**
 * This worktree's `.tmp/` — scratch that can resolve node_modules, so a child
 * preload written there can import `blessed`.
 *
 * Exactly TWO levels up from src/tui: one lands on `src/`, and three escapes
 * into the shared `tree/` parent, a directory no single worktree owns.
 */
const REPO_TMP = join(import.meta.dir, "..", "..", ".tmp",);
mkdirSync(REPO_TMP, { recursive: true, },);

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
let configEnabled = true;
if (ISOLATED) {
  mock.module("../config/load", () => ({
    loadConfig: (): unknown => {
      if (configError) { throw configError; }
      return { tui: { sessionToken: configToken, enabled: configEnabled, }, };
    },
  }),);
}

let createTUIApp: () => TUIApp;
let setFetch: (fn: typeof safeFetch,) => void;
let setPickerFetch: (fn: typeof safeFetch,) => void;
let setModelsFetch: (fn: typeof safeFetch,) => void;
let realFetch: typeof safeFetch;
/** blessed.screen() calls consumed by the module import itself. */
let screensAtImport: number;
let exitSpy: ReturnType<typeof spyOn> | null = null;

/** Rows the PUBLIC provider list stub answers with; overridden per test. */
let publicProviders: Array<{ name: string; label: string; status: string }> = [
  { name: "openai", label: "OpenAI", status: "healthy", },
  { name: "ollama", label: "Ollama", status: "healthy", },
];

beforeAll(async () => {
  // Dynamic import required: `mock.module` replaces the resolution table only
  // for modules imported after the stub registers.
  createTUIApp = (await import("./app")).createTUIApp;
  setFetch = (await import("./harness/api")).setFetch;
  setPickerFetch = (await import("./chat-picker")).setFetch;
  setModelsFetch = (await import("./models-api")).setFetch;
  realFetch = (await import("../utils")).safeFetch;
  screensAtImport = screenCreations;
},);

beforeEach(() => {
  // Clear the global logger so every test starts from the pristine
  // "never initialized" state `getLogger()` throws on. `createLogger` seeds
  // the root with `??=` (src/logger/index.ts:31), so WITHOUT this reset the
  // first createTUIApp() in the file seeds it for good and the ordering test
  // below passes on a logger some earlier test happened to create — the
  // createLogger -> new TUIApp() order in createTUIApp is load-bearing and
  // would be unpinned. Resetting here (not around the one test) keeps every
  // test independent; createTUIApp re-seeds on its own, so nothing else
  // observes the null. The cast: setGlobalLogger is typed for a real Logger,
  // but the test needs the reachable null the holder starts at.
  setGlobalLogger(null as never,);
  configError = null;
  configToken = "test-token";
  configEnabled = true;
  textWidgets.length = 0;
  publicProviders = [
    { name: "openai", label: "OpenAI", status: "healthy", },
    { name: "ollama", label: "Ollama", status: "healthy", },
  ];

  // HarnessView.toggle() fires `void this.refresh()`, which fetches the runs
  // list and — when that list is empty — the stats rollup. Without this stub
  // an F3 press opens a real socket to localhost. The two endpoints answer
  // different shapes, so the double routes on the URL rather than handing
  // both the runs envelope.
  const emptyHarness = async <T,>(url: string,): Promise<FetchResult<T>> => {
    const data = url.endsWith("/stats",)
      ? { totals: { runs: 0, failures: 0, costUsd: 0, }, byModel: [], byTaskType: [], byPattern: [], toolingGaps: [], }
      : { items: [], };

    return { ok: true, data: data as T, status: 200, headers: new Headers(), };
  };

  setFetch(emptyHarness as unknown as typeof safeFetch,);

  // F6 fires ModelsOverlay.show(), which refreshes the role list, and the boot
  // health fetch hits the PUBLIC provider list — same reason as the harness stub
  // above. The two envelopes differ, so the stub routes on URL; without it the
  // boot health call would read `providers` off a roles envelope.
  setModelsFetch(<T,>(url: string,): Promise<FetchResult<T>> =>
    Promise.resolve({
      ok: true,
      data: (url.endsWith("/providers",)
        ? { providers: publicProviders, }
        : { roles: [], overrides: {}, validRoles: [], }) as T,
      status: 200,
      headers: new Headers(),
    },)
  );
},);

afterEach(() => {
  exitSpy?.mockRestore();
  exitSpy = null;
  // Per-test rather than once in `afterAll`: a failing test must not leave
  // its fetch stub installed for everything that runs after it.
  setFetch(realFetch,);
  setPickerFetch(realFetch,);
},);

/**
 * A two-row chat list in the exact envelope `GET /api/v1/chats` answers
 * (src/routes/chats/list.ts -> jsonPaginated): `{ data, pagination, meta }`.
 */
const CHAT_LIST_DOUBLE = {
  data: [
    { id: "chat-aaaaaaaa", name: "Sunken Keep", is_pinned: "unpinned", },
    { id: "chat-bbbbbbbb", name: "Night Market", is_pinned: "unpinned", },
  ],
  pagination: { total: 2, page: 1, pageSize: 50, totalPages: 1, },
};

/** Install the chat-picker fetch stub. Separate from the harness `setFetch`. */
function setPickerChats(payload: unknown,): void {
  setPickerFetch(<T,>(): Promise<FetchResult<T>> =>
    Promise.resolve({ ok: true, data: payload as T, status: 200, headers: new Headers(), } as FetchResult<T>,)
  );
}

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

  // TASK-tui-enabled-config-flag-never-read: [tui].enabled was env-mapped and
  // documented but nothing read it, so ENABLE_TUI=false booted the shell anyway.
  it("refuses to start and exits when [tui].enabled is false", () => {
    exitSpy = spyOn(process, "exit",).mockImplementation((() => {}) as never,);
    configEnabled = false;

    const app = createTUIApp();

    expect(exitSpy,).toHaveBeenCalledWith(0,);
    expect((app.screen as unknown as WidgetStub).destroyed,).toBe(true,);
    expect(statusBar().content,).toContain("disabled",);
  });

  it("starts normally when the config cannot be read at all", () => {
    // A broken config file must not silence the shell: the default stands.
    configError = new Error("no config.toml",);
    createTUIApp();
    expect(statusBar().content,).toContain("F2: assets",);
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
    // Observable stand-in for a call count: the refresh the closure fires must
    // observe the asset view already re-pointed, so record what the widget
    // reports at the moment it is asked to reload. Dropping the setChatId
    // call, or moving it after the refresh, lands null here.
    const chatIdAtRefresh: (string | null)[] = [];
    spyOn(app.chat, "loadMessages",).mockImplementation(() => {
      chatIdAtRefresh.push(app.assets.getChatId(),);
      return Promise.resolve();
    },);

    onChatChange("0123456789abcdef",);
    await flushMicrotasks();

    expect(app.assets.getChatId(),).toBe("0123456789abcdef",);
    expect(statusBar().content,).toContain("chat: 01234567...",);
    expect(chatIdAtRefresh,).toEqual(["0123456789abcdef",],);
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

  it("toggles the chat picker with F1 and back off the next press", () => {
    const app = createTUIApp();
    expect(app.chatPicker.isVisible(),).toBe(false,);

    pressKey(app, "f1",);
    expect(app.chatPicker.isVisible(),).toBe(true,);

    pressKey(app, "f1",);
    expect(app.chatPicker.isVisible(),).toBe(false,);
  });

  it("leaves the chat picker hidden after a double F1 press", () => {
    const app = createTUIApp();
    pressKey(app, "f1",);
    pressKey(app, "f1",);
    expect(app.chatPicker.isVisible(),).toBe(false,);
  });

  // ── Provider health on the status bar ──────────────────────
  // The segment must never cost the chat id or the key hints: an operator who
  // cannot see which chat they are in has lost more than the health reading is
  // worth, and these tests assert the message survives a health repaint.

  it("fills in the health segment after boot", async () => {
    createTUIApp();
    await flushMicrotasks();
    expect(statusBar().content,).toContain("Providers: {green-fg}2{/green-fg}/2 ok",);
  });

  it("keeps the segment spliced in without eating the message or the hints", async () => {
    createTUIApp();
    await flushMicrotasks();
    const content = statusBar().content;
    expect(content,).toContain("F6: models",);
    expect(content,).toContain("Providers:",);
  });

  it("names an unreachable provider without clobbering the chat line", async () => {
    publicProviders = [
      { name: "openai", label: "OpenAI", status: "healthy", },
      { name: "ollama", label: "Ollama", status: "unreachable", },
    ];

    const app = createTUIApp();
    await flushMicrotasks();

    const chat = app.chat as unknown as { setChatId?: (id: string,) => void };
    chat.setChatId?.("0123456789abcdef",);
    await flushMicrotasks();

    expect(statusBar().content,).toContain("chat: 01234567...",);
    expect(statusBar().content,).toContain("ollama",);
  });

  // A dead health route must degrade the SEGMENT, not the whole bar — losing
  // the chat id to a provider-list outage would be a bad trade.
  it("degrades to the unknown marker when the health fetch fails", async () => {
    setModelsFetch(<T,>(): Promise<FetchResult<T>> => Promise.reject(new Error("ECONNREFUSED",),));

    createTUIApp();
    await flushMicrotasks();

    expect(statusBar().content,).toContain("Providers: ?",);
    expect(statusBar().content,).toContain("F6: models",);
  });

  it("refreshes the segment on F5", async () => {
    const app = createTUIApp();
    await flushMicrotasks();
    publicProviders = [{ name: "openai", label: "OpenAI", status: "unreachable", },];

    pressKey(app, "f5",);
    await flushMicrotasks();

    expect(statusBar().content,).toContain("/1 ok",);
  });

  it("toggles the models overlay with F6 and back off the next press", () => {
    const app = createTUIApp();
    expect(app.models.isVisible(),).toBe(false,);

    pressKey(app, "f6",);
    expect(app.models.isVisible(),).toBe(true,);

    pressKey(app, "f6",);
    expect(app.models.isVisible(),).toBe(false,);
  });

  it("closes the models overlay on Esc without quitting", () => {
    const app = createTUIApp();
    pressKey(app, "f6",);
    expect(app.models.isVisible(),).toBe(true,);

    exitSpy = spyOn(process, "exit",).mockImplementation((() => {}) as never,);
    pressKey(app, "escape",);

    expect(exitSpy,).not.toHaveBeenCalled();
    expect(app.models.isVisible(),).toBe(false,);
  });

  it("closes the chat picker on Esc even when the models overlay is also open", () => {
    const app = createTUIApp();
    pressKey(app, "f6",);
    pressKey(app, "f1",);

    pressKey(app, "escape",);

    expect(app.chatPicker.isVisible(),).toBe(false,);
    expect(app.models.isVisible(),).toBe(true,);
  });

  it("closes the chat picker on Esc without quitting", () => {
    const app = createTUIApp();
    pressKey(app, "f1",);
    expect(app.chatPicker.isVisible(),).toBe(true,);

    exitSpy = spyOn(process, "exit",).mockImplementation((() => {}) as never,);
    pressKey(app, "escape",);

    expect(exitSpy,).not.toHaveBeenCalled();
    expect(app.chatPicker.isVisible(),).toBe(false,);
  });

  it("still quits on Esc when no overlay is open", () => {
    const app = createTUIApp();

    exitSpy = spyOn(process, "exit",).mockImplementation((() => {}) as never,);
    pressKey(app, "escape",);

    expect(exitSpy,).toHaveBeenCalled();
  });

  // The defect this pins: `ChatWidget.chatId` starts null, so before the picker
  // every send returned "No active chat". The assertion is deliberately on BOTH
  // views — binding only the chat widget would leave the asset sidebar pointing
  // at the previous chat while the transcript shows the new one.
  it("binds both the chat widget and the asset view when a picker row is selected", async () => {
    const app = createTUIApp();
    setPickerChats(CHAT_LIST_DOUBLE,);
    spyOn(app.assets, "loadAssets",).mockResolvedValue(undefined,);
    spyOn(app.chat, "loadMessages",).mockResolvedValue(undefined,);

    pressKey(app, "f1",);
    await flushMicrotasks();

    const list = (app.chatPicker as unknown as { list: WidgetStub }).list;
    list.emit("select", list, 1,);
    await flushMicrotasks();

    expect(app.chat.getChatId(),).toBe("chat-bbbbbbbb",);
    expect(app.assets.getChatId(),).toBe("chat-bbbbbbbb",);
    expect(app.chatPicker.isVisible(),).toBe(false,);
  });

  it("reloads the message list after a picker selection", async () => {
    const app = createTUIApp();
    setPickerChats(CHAT_LIST_DOUBLE,);
    spyOn(app.assets, "loadAssets",).mockResolvedValue(undefined,);
    const loadSpy = spyOn(app.chat, "loadMessages",).mockResolvedValue(undefined,);

    pressKey(app, "f1",);
    await flushMicrotasks();

    const list = (app.chatPicker as unknown as { list: WidgetStub }).list;
    list.emit("select", list, 0,);
    await flushMicrotasks();

    expect(loadSpy,).toHaveBeenCalled();
    expect(statusBar().content,).toContain("chat: chat-aaa",);
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
  // version silently accepts dropping `q` or `C-c` from the array. Verified by
  // mutation: narrowing the binding to escape alone fails the `q` and `C-c`
  // cases (2 of 20 red).
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

// ── Entry-point guard ─────────────────────────────────────────────────────
// The `if (import.meta.main)` guard is the shipped TUI's launch switch: neuter
// it and `bun run src/tui/app.ts` exits without building anything. No test
// above can see that — every one reaches the shell through createTUIApp(),
// never through the guard — so the only honest witness runs app.ts as a REAL
// entry point in a child process and watches it construct.
//
// The child gets a preload that swaps blessed's factories for counting stubs:
// the real ones open a terminal and block on terminal events outside a TTY.
// Preload runs before the entry module, so the swap is in place by the time
// the guard fires, and it counts only what the ENTRY builds — the child's
// module registry is its own, so nothing the parent did can reach it.
// `bun --preload` rather than mock.module because a child process has no test
// runner to register the mock with.
//
// The preload is written under THIS worktree's `.tmp/` (not os tmpdir) on
// purpose. A tmpdir preload does NOT fail to resolve — bun falls back to its
// global install cache (`~/.bun/install/cache/blessed@…`), so the preload patches
// THAT copy of blessed while app.ts loads the node_modules copy. The stub never
// lands and the count reads 0 for the wrong reason: a dual module instance, not a
// missing package. Verified both ways.
const ENTRY_PRELOAD = `
import blessed from "blessed";

let screens = 0;
const widget = () => ({
  visible: true, content: "", items: [], destroyed: false, renderCount: 0,
  keyHandlers: [], focused: null,
  on() {}, emit() {}, key() {}, render() {}, setContent() {}, show() {}, hide() {},
  focus() {}, destroy() {}, clearValue() {}, getValue() { return ""; }, setValue() {},
  submit() {}, clearItems() {}, add() {}, addItem() {}, setItems() {}, select() {}, append() {},
});

blessed.screen = () => { screens += 1; return widget(); };
blessed.box = () => widget();
blessed.list = () => widget();
blessed.text = () => widget();
blessed.textbox = () => widget();

process.on("exit", () => { console.log("SCREENS_CREATED=" + screens); });
`;

describeOrSkip("entry-point guard", () => {
  // spawnSync's `timeout` is the anti-wedge guard, not decoration: the real TUI
  // has no exit path outside a TTY, so a regression that left the child holding
  // terminal handles would hang this suite forever. Measured exit is ~0.08s;
  // 10s leaves slack for a cold module graph, and past it the child is killed,
  // turning a wedge into an ordinary assertion failure.
  it("builds the shell when app.ts runs as an entry point", () => {
    const dir = mkdtempSync(join(REPO_TMP, "tui-entry-",),);
    const preload = join(dir, "preload.ts",);
    writeFileSync(preload, ENTRY_PRELOAD, "utf8",);

    try {
      const proc = Bun.spawnSync({
        cmd: [process.execPath, "--preload", preload, join(import.meta.dir, "app.ts",),],
        cwd: dir,
        timeout: 10_000,
        stdout: "pipe",
        stderr: "pipe",
      },);

      // The count is the assertion; exit code alone would pass on a crash that
      // happened after the screen. stderr rides along as the failure message.
      //
      // Word-bounded, NOT a bare substring: `toContain("SCREENS_CREATED=1")` also
      // matches "SCREENS_CREATED=10" and "SCREENS_CREATED=12", so a regression that
      // built several screens would sail through. `\b` after the digit admits only a
      // non-digit (or end of input) next.
      expect(proc.stdout.toString(), proc.stderr.toString(),).toMatch(/SCREENS_CREATED=1\b/,);
      // Not redundant with the stdout check: a wedged child is killed at the
      // timeout above, and bun then reports exitCode null (bun 1.4.2), which this
      // catches. Kept as the second witness.
      expect(proc.exitCode, proc.stderr.toString(),).toBe(0,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });
},);
