// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI Screen Manager
 *
 * Layout: chat view (full width), toggleable asset sidebar (right 30%),
 * input box at bottom, status bar at very bottom.
 * Global shortcuts: Esc/q/Ctrl+C quit, Tab focus switch, F2 toggle assets.
 */

import blessed from "blessed";
import { loadConfig, } from "../config/load";
import { TUI_DEFAULTS, } from "../config/sections/tui";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import { bindGlobalKeys, } from "./app-keys";
import { AssetView, } from "./asset-view";
import { API_BASE, ChatWidget, } from "./chat";
import { ChatPicker, } from "./chat-picker";
import { createHarnessView, type HarnessView, } from "./harness";
import { escapeMarkup, } from "./markup";
import { loadPublicProviders, } from "./models-api";
import { formatProviderHealth, HEALTH_UNAVAILABLE, } from "./models-display";
import { ModelsOverlay, } from "./models-overlay";

/** Status line painted when `[tui].enabled` is false; the shell exits right after. */
export const TUI_DISABLED_STATUS = "TUI disabled by config — set [tui].enabled = true to start";

/** Where the TUI's structured log is written; blessed owns the terminal. */
export const TUI_LOG_PATH = ".tmp/tui/tui.jsonl";

/** */
export class TUIApp {
  private statusBar: blessed.Widgets.TextElement;
  screen: blessed.Widgets.Screen;
  // Definite-assignment: the [tui].enabled gate returns from the constructor
  // before any widget exists. The shell is unusable in that case by design -
  // the process is on its way out and no caller holds the instance.
  chat!: ChatWidget;
  assets!: AssetView;
  harness!: HarnessView;
  chatPicker!: ChatPicker;
  models!: ModelsOverlay;
  /** Last message written by `updateStatus`, replayed so a health refresh
   * repaints the health segment without erasing the chat id or key hints. */
  private statusMessage = "";
  /** Rendered health segment; empty until the first fetch resolves. */
  private healthSegment = "";

  /** */
  constructor() {
    // Load config once at startup to pick up [tui].sessionToken. A
    // failed load (no config file, parse error, etc.) must not crash
    // the TUI — log and fall back to anonymous mode (solo deployments
    // ignore missing tokens).
    let sessionToken: string | undefined;
    let sendTimeoutMs: number | undefined;
    // An unreadable config must not silence the shell: fall back to the
    // default so a broken config file still yields a working TUI.
    let tuiEnabled = TUI_DEFAULTS.enabled;
    try {
      const config = loadConfig();
      sessionToken = config.tui.sessionToken;
      sendTimeoutMs = config.tui.sendTimeoutMs;
      tuiEnabled = config.tui.enabled;
    } catch (error) {
      getLogger().warn(`tui: failed to load config; running anonymous: ${(error as Error).message}`,);
    }

    this.screen = blessed.screen({
      smartCSR: true,
      title: "Loop Lore TUI",
      // The chat input reads keystrokes while it is focused, and blessed drops
      // EVERY screen-level keypress while a widget holds `screen.grabKeys`
      // (widgets/screen.js:591). `ignoreLocked` is blessed's own escape hatch
      // for exactly this: these keys reach their handler even mid-read. `q` is
      // deliberately absent — it is ordinary text inside a message, and the box
      // must keep it. Nothing types Esc/C-l/F-keys, so all of them are safe.
      ignoreLocked: ["escape", "C-c", "f1", "f2", "f3", "f5", "f6", "C-l", "tab",],
    },);

    // ── Status bar (bottom) ─────────────────────────────────
    this.statusBar = blessed.text({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      content: "",
      tags: true,
      style: { bg: "blue", fg: "white", },
    },);

    this.updateStatus("initializing...",);

    // [tui].enabled = false is the deployment kill switch (TASK-tui-enabled-
    // config-flag-never-read). Honour it before any widget exists: the screen
    // and status bar are already built, so one render paints the reason.
    if (!tuiEnabled) {
      this.updateStatus(TUI_DISABLED_STATUS,);
      // Returning the call keeps the constructor from building widgets even
      // where process.exit is stubbed out, and marks the rest unreachable.
      return this.shutdown();
    }

    this.chat = new ChatWidget(this.screen, {
      sessionToken,
      sendTimeoutMs,
      // After /image or /upload the chat has new assets server-side — the
      // sidebar only loads on chat switch, so reload it here to keep the
      // acceptance flow (generate -> sidebar -> attach) actually reachable.
      onAssetsRefresh: () => {
        void this.assets.loadAssets();
      },
      linkAsset: (assetId,) => this.assets.attachAsset(assetId,),
      // The overlays are built after the chat; the closure runs at keypress
      // time, when all of them exist. Without this the screen-level Tab would
      // pull focus into the chat input underneath an open overlay.
      isOverlayOpen: () => this.overlayOpen(),
      onChatChange: (chatId,) => {
        this.assets.setChatId(chatId,);
        this.updateStatus(`chat: ${chatId.slice(0, 8,)}... | F2: assets`,);
        void this.chat.loadMessages();
      },
    },);

    // ── Asset view (right sidebar, toggleable) ─────────────
    this.assets = new AssetView(this.screen, { sessionToken, },);

    // ── Harness view (full-screen overlay, toggleable) ──────
    this.harness = createHarnessView(this.screen, {
      sessionToken,
      // F3 shows this view; if another overlay is stacked on top, harness
      // up/down/enter must not fire beneath it.
      isBlockedByOverlay: () => this.chatPicker.isVisible() || this.models.isVisible(),
    },);

    // ── Chat picker (full-screen overlay, toggleable) ───────
    // Selection routes through `chat.setChatId`, the SAME path the web client
    // uses, so the chat's onChatChange callback stays the single place that
    // re-points the asset view and reloads messages. Binding the two views
    // here as well would be the second binding path and they would drift.
    this.chatPicker = new ChatPicker(this.screen, {
      sessionToken,
      onSelect: (chatId,) => {
        this.chatPicker.hide();
        this.chat.setChatId(chatId,);
        this.updateStatus(`chat: ${chatId.slice(0, 8,)}... | F2: assets`,);
      },
      onHide: () => {
        this.chat.focusInput();
      },
    },);

    // ── Models overlay (full-screen, toggleable) ────────────
    // Admin model/provider configuration. Reads and writes through the same
    // `config.tui.sessionToken` as every other view, so a 403 here means the
    // token's user lacks admin.system and the overlay says so rather than
    // failing silently.
    this.models = new ModelsOverlay(this.screen, { sessionToken, },);

    // ── Resize handler ─────────────────────────────────────
    this.screen.on("resize", () => {
      this.screen.render();
    },);

    // ── Global keyboard shortcuts ──────────────────────────
    bindGlobalKeys(this,);

    this.updateStatus(
      "ready — F1: chats | Tab: focus | F2: assets | F3: harness | F5: refresh | F6: models | Esc/q: quit",
    );

    // One fetch after the bar is painted, so the segment fills in without
    // delaying the shell. No timer: a chat client has no business holding a
    // background interval open to redraw a status line.
    this.refreshProviderHealth();

    this.screen.render();
  }

  // ── Status bar ─────────────────────────────────────────────

  /**
   * Write the status bar, splicing in the provider-health segment when one has
   * loaded. The message is remembered so a later health refresh can repaint the
   * bar without clobbering the chat id or the key hints.
   * @param msg - the transient message (chat id, toggle state, hint)
   */
  updateStatus(msg: string,): void {
    this.statusMessage = msg;
    // Leading separator only once the segment exists, so the bar has no double
    // gap before the first fetch resolves.
    const health = this.healthSegment ? `  |  ${this.healthSegment}` : "";
    this.statusBar.setContent(
      ` {bold}Loop Lore{/bold}  |  ${escapeMarkup(msg,)}${health}  |  ${escapeMarkup(API_BASE,)}  `,
    );

    this.screen.render();
  }

  /**
   * Refresh the provider-health segment from the PUBLIC provider list.
   *
   * Deliberately separate from `updateStatus`: a failed fetch degrades the
   * segment to a short marker and leaves the message untouched, so an outage
   * of the health route can neither spam the bar nor hide the chat id.
   */
  refreshProviderHealth(): void {
    void (async () => {
      const result = await loadPublicProviders();
      const next = result.ok
        ? formatProviderHealth(result.data.providers ?? [],)
        : HEALTH_UNAVAILABLE;

      // Repaint only on a real change: F5 fires this on every chat refresh and
      // an unchanged bar should not redraw.
      if (next === this.healthSegment) { return; }
      this.healthSegment = next;
      this.updateStatus(this.statusMessage,);
    })();
  }

  // ── Overlay ownership ───────────────────────────────────────────────

  /**
   * True when any full-screen overlay owns the keyboard. Screen-level key
   * bindings on overlays must check this so keys do not fire beneath an
   * overlay stacked on top (e.g. harness up/down/enter under the models
   * overlay).
   */
  private overlayOpen(): boolean {
    return this.chatPicker.isVisible() || this.harness.isVisible() || this.models.isVisible();
  }

  // ── Shutdown ───────────────────────────────────────────────

  /**
   * Tear down the screen and exit. Typed `never` because `process.exit` is:
   * callers can `return` straight after it, and the compiler treats the rest
   * of the branch as unreachable.
   * @returns never — the process is gone before this returns
   */
  shutdown(): never {
    this.screen.destroy();
    return process.exit(0,);
  }
}

/**
 * Boot the TUI shell: initialize the global logger, then construct the app.
 *
 * The constructor calls loadConfig(), which logs via getLogger(); without the
 * init here a config failure crashes the TUI inside its own catch block (see
 * BUG-tui-app-getlogger-throws-when-running-standalone). Keeping both steps
 * behind this factory is what makes importing the module side-effect free —
 * nothing touches a terminal until a caller asks for the app.
 * @returns {TUIApp} the constructed shell, with its screen and widgets bound
 * @throws if `new TUIApp()` fails — the constructor's own config-load catch
 *   calls `getLogger()`, which throws when no logger is initialized
 */
export function createTUIApp(): TUIApp {
  // `console: false` keeps records in `.tmp/tui/tui.jsonl` only — a console write
  // lands between two blessed frames and corrupts the render. `setGlobalLogger`
  // is load-bearing: `createLogger` adopts the global holder with `??=`
  // (src/logger/index.ts:31), so when a process bootstrapped a root before us the
  // returned instance would never become it and every `getLogger()` caller in the
  // TUI would keep the console transport. Replacing the root is what makes the
  // option the one in force.
  setGlobalLogger(createLogger({ level: "warn", console: false, jsonlPath: TUI_LOG_PATH, },),);
  return new TUIApp();
}

// Entry-point guard — the idiom every script under scripts/ uses. The TUI
// still auto-starts under `bun run src/tui/app.ts`, and stays inert when a
// test runner or any other tool imports the module.
if (import.meta.main) {
  createTUIApp();
}
