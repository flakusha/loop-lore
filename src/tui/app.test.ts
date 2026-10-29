// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * App shell (pi-tui): AppShell layout (status bar survival, sidebar split)
 * and the global key router in app-keys.ts, driven through a real (headless)
 * TUI with `injectDebugInput`.
 *
 * The TUIApp constructor itself is NOT exercised end-to-end here: it wires the
 * real config loader, the real provider-health fetch and `tui.start()`; the
 * disabled-config gate and factory are covered by the config seams elsewhere.
 * What needs the engine is the key router, and it only needs `addInputListener`
 * + `injectDebugInput`, which work on an unstarted TUI.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { existsSync, readFileSync, } from "node:fs";
import { dirname, } from "node:path";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import { safeFetch, } from "../utils";
import { AppShell, createTUIApp, TUI_LOG_PATH, TUIApp, } from "./app";
import { bindGlobalKeys, } from "./app-keys";
import type { KeyBindingHost, } from "./app-keys";
import { AssetView, setFetch as setAssetFetch, } from "./asset-view";
import { ChatWidget, } from "./chat";
import { ChatPicker, } from "./chat-picker";
import { createHarnessView, } from "./harness";
import { setFetch as setModelsFetch, } from "./models-api";
import { ModelsOverlay, } from "./models-overlay";
import { ProcessTerminal, TUI, visibleWidth, } from "./pi";
import { stripRows, } from "./test-support";

interface HostLog {
  status: string[];
  healthRefreshes: number;
  exits: number;
}

function buildHost(): { host: KeyBindingHost; log: HostLog } {
  const chat = new ChatWidget({},);
  const assets = new AssetView({},);
  const harness = createHarnessView({},);
  const chatPicker = new ChatPicker({ onSelect: () => {}, },);
  const models = new ModelsOverlay({},);
  const log: HostLog = { status: [], healthRefreshes: 0, exits: 0, };

  const host: KeyBindingHost = {
    tui: new TUI(new ProcessTerminal(),),
    chat,
    assets,
    chatPicker,
    harness,
    models,
    isTyping: () => chat.isInputFocused() || chatPicker.isPromptOpen(),
    updateStatus: (msg,) => log.status.push(msg,),
    refreshProviderHealth: () => {
      log.healthRefreshes++;
    },
    shutdown: (): never => {
      log.exits++;
      throw new Error("exit",);
    },
  };

  return { host, log, };
}

afterEach(() => {
  setAssetFetch(safeFetch,);
  setModelsFetch(safeFetch,);
},);

/**
 * Resource contract: every TUIApp constructed here is tracked and stopped in
 * `afterEach` (TUI.stop is idempotent, so the smoke test's own stop is
 * harmless), and any global root logger a test replaces is restored, so a
 * failed test cannot leak render loops or a foreign logger into later tests.
 * `getLogger()` throws before any initialization, hence the try/catch.
 */
const createdApps: TUIApp[] = [];
let savedLogger: ReturnType<typeof getLogger> | null = null;

beforeEach(() => {
  try {
    savedLogger = getLogger();
  } catch {
    savedLogger = null;
  }
},);

afterEach(() => {
  for (const app of createdApps) {
    app.tui.stop();
  }

  createdApps.length = 0;
  if (savedLogger !== null) {
    setGlobalLogger(savedLogger,);
  }
},);

function trackApp(app: TUIApp,): TUIApp {
  createdApps.push(app,);
  return app;
}

describe("global key router", () => {
  it("Escape quits when nothing is open", () => {
    const { host, log, } = buildHost();
    bindGlobalKeys(host,);
    expect(() => host.tui.injectDebugInput("\x1b",)).toThrow("exit",);
    expect(log.exits,).toBe(1,);
  });

  it("Escape closes the top overlay before quitting", () => {
    const { host, log, } = buildHost();
    bindGlobalKeys(host,);
    host.chatPicker.show();
    host.tui.injectDebugInput("\x1b",);
    expect(host.chatPicker.isVisible(),).toBe(false,);
    expect(log.exits,).toBe(0,);
    expect(host.chat.isInputFocused(),).toBe(true,);
  });

  it("q quits only while no text field is typing", () => {
    const { host, log, } = buildHost();
    bindGlobalKeys(host,);
    host.chat.focusInput();
    expect(() => host.tui.injectDebugInput("q",)).not.toThrow();
    expect(log.exits,).toBe(0,);

    host.chat.handleTab(); // focus moves to the transcript
    expect(() => host.tui.injectDebugInput("q",)).toThrow("exit",);
  });

  it("F1 toggles the picker; F3 refreshes the harness on open", async () => {
    const { host, log, } = buildHost();
    bindGlobalKeys(host,);
    let refreshes = 0;
    host.harness.refresh = async () => {
      refreshes++;
    };

    host.tui.injectDebugInput("\x1bOP",); // F1
    expect(host.chatPicker.isVisible(),).toBe(true,);

    host.tui.injectDebugInput("\x1b[13~",); // F3 (xterm)
    expect(host.chatPicker.isVisible(),).toBe(false,);
    expect(host.harness.isVisible(),).toBe(true,);
    expect(log.status.at(-1,),).toBe("Harness: visible",);

    await new Promise((resolve,) => setImmediate(resolve,));
    expect(refreshes,).toBe(1,);
  });

  it("F2 toggles the asset sidebar and reports state", () => {
    const { host, log, } = buildHost();
    bindGlobalKeys(host,);
    host.tui.injectDebugInput("\x1bOQ",); // F2
    expect(host.assets.isVisible(),).toBe(true,);
    expect(log.status.at(-1,),).toBe("Assets: visible",);
    host.tui.injectDebugInput("\x1bOQ",);
    expect(host.assets.isVisible(),).toBe(false,);
  });

  it("F5 refreshes provider health and the active chat", async () => {
    const { host, log, } = buildHost();
    bindGlobalKeys(host,);
    let loads = 0;
    host.chat.loadMessages = async () => {
      loads++;
    };

    host.chat.setChatId("chat-1",);

    host.tui.injectDebugInput("\x1b[15~",); // F5
    await new Promise((resolve,) => setImmediate(resolve,));
    expect(log.healthRefreshes,).toBe(1,);
    expect(loads,).toBe(1,);
  });

  it("Ctrl+L clears the message display", () => {
    const { host, log, } = buildHost();
    bindGlobalKeys(host,);
    host.chat.addMessage({ id: "1", role: "user", content: "x", },);
    host.tui.injectDebugInput("\x0c",);
    expect(host.chat.itemCount,).toBe(0,);
    expect(log.status.at(-1,),).toBe("display cleared",);
  });

  it("Tab routes to the chat widget only without overlays", () => {
    const { host, } = buildHost();
    bindGlobalKeys(host,);
    host.tui.injectDebugInput("\t",);
    expect(host.chat.isInputFocused(),).toBe(false,);

    host.chatPicker.show();
    host.tui.injectDebugInput("\t",);
    // Focus unchanged: the overlay owned the key.
    expect(host.chat.isInputFocused(),).toBe(false,);
  });
});

describe("AppShell layout", () => {
  it("renders body rows plus a full-width status bar that survives re-render", () => {
    const chat = new ChatWidget({},);
    const assets = new AssetView({},);
    const shell = new AppShell(chat, assets, () => 12,);
    shell.setStatus(" Loop Lore  |  ready",);

    const first = shell.render(40,) as string[];
    expect(first,).toHaveLength(12,);
    const statusRow = first.at(-1,)!;
    expect(statusRow,).toContain("\x1b[44m",);
    expect(stripRows([statusRow,],)[0]!.length,).toBe(40,);

    const again = shell.render(40,) as string[];
    expect(stripRows([again.at(-1,)!,],)[0],).toContain("ready",);
  });

  it("splits the body 70/30 with a divider while the sidebar is visible", () => {
    const chat = new ChatWidget({},);
    const assets = new AssetView({},);
    const shell = new AppShell(chat, assets, () => 10,);

    const without = shell.render(100,) as string[];
    expect(without[0],).not.toContain("│",);

    assets.show();
    const withSidebar = shell.render(100,) as string[];
    expect(withSidebar[0],).toContain("│",);
    expect(stripRows(withSidebar,).every((row,) => row.length === 100),).toBe(true,);
  });

  // Below 25 columns (chat min 20 + divider 1 + sidebar min 4) the split
  // cannot fit: the chat takes the full width for that frame and the sidebar
  // column is skipped rather than silently clipped by the engine at flush.
  it("renders the chat at full width without the sidebar below the 25-column split minimum", () => {
    const chat = new ChatWidget({},);
    const assets = new AssetView({},);
    const shell = new AppShell(chat, assets, () => 10,);
    shell.setStatus(" Loop Lore  |  ready",);
    assets.show();

    for (const width of [10, 20, 24,]) {
      const rows = shell.render(width,) as string[];
      expect(rows.every((row,) => visibleWidth(row,) <= width),).toBe(true,);
      expect(rows[0],).not.toContain("│",);
    }

    // Still padded to exactly the frame width at a comfortable size.
    const wide = shell.render(80,) as string[];
    expect(wide.every((row,) => visibleWidth(row,) <= 80),).toBe(true,);
    expect(wide[0],).toContain("│",);
  });
});

describe("TUIApp smoke", () => {
  it("constructs with the engine, widgets and key router wired", async () => {
    setModelsFetch(<T,>(): Promise<{ ok: true; data: T; status: 200; headers: Headers }> =>
      Promise.resolve({ ok: true, data: { providers: [], } as T, status: 200, headers: new Headers(), },)
    );

    const app = trackApp(createTUIApp(),);

    expect(app,).toBeInstanceOf(TUIApp,);
    expect(app.chat.getChatId(),).toBeNull();
    expect(app.assets,).toBeDefined();
    expect(app.harness.isVisible(),).toBe(false,);
    expect(app.chatPicker.isVisible(),).toBe(false,);
    expect(app.models.isVisible(),).toBe(false,);
    expect(app.isTyping(),).toBe(true,); // chat input focused at boot

    app.updateStatus("still here",);
    app.tui.stop();
  }, 15000,);
});

describe("TUI logging", () => {
  function stubHealth(): void {
    setModelsFetch(<T,>(): Promise<{ ok: true; data: T; status: 200; headers: Headers }> =>
      Promise.resolve({ ok: true, data: { providers: [], } as T, status: 200, headers: new Headers(), },)
    );
  }

  // The renderer owns the terminal. A log line written straight to it lands
  // between two frames and corrupts the paint, so the TUI logger keeps its
  // records in a file and carries no console transport at all.
  it("leaves the TUI logger with a file transport and no console transport", () => {
    stubHealth();
    trackApp(createTUIApp(),);

    const logger = getLogger() as unknown as { transports: { name: string }[] };
    const names = logger.transports.map((transport,) => transport.name);

    expect(names,).not.toContain("console",);
    expect(names,).toContain("file",);
  });

  // The file transport is only useful if it writes WHERE the TUI says it
  // writes. The marker is unique per run, so a log file left over from an
  // earlier run cannot satisfy the assertion.
  it("writes the TUI's structured log to the TUI log path", async () => {
    stubHealth();
    trackApp(createTUIApp(),);

    const marker = `tui log path probe ${Date.now()}-${Math.random()}`;
    const logger = getLogger();
    logger.warn(marker,);

    await logger.flush();

    expect(dirname(TUI_LOG_PATH,),).toBe(".tmp/tui",);
    expect(existsSync(TUI_LOG_PATH,),).toBe(true,);
    expect(readFileSync(TUI_LOG_PATH, "utf8",),).toContain(marker,);
  });

  // `createLogger` adopts the global root with `??=`: when a root already
  // exists it returns a fresh LoggerImpl that never becomes the root. This
  // seeds the root from elsewhere first — the shape of a TUI launched from a
  // process that logged during bootstrap.
  it("strips the console transport from a root logger it did not create", () => {
    stubHealth();
    const foreign = createLogger({ level: "error", },);
    setGlobalLogger(foreign,);
    const names = (): string[] =>
      (getLogger() as unknown as { transports: { name: string }[] })
        .transports.map((transport,) => transport.name);

    expect(names(),).toContain("console",);

    trackApp(createTUIApp(),);

    expect(names(),).not.toContain("console",);
  });
});
