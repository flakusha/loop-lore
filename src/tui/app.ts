// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 300
/**
 * TUI App Shell (pi-tui)
 *
 * One pi-tui engine whose root child is an `AppShell` component: chat column
 * (optionally split 70/30 with the asset sidebar) above a one-row status bar.
 * The full-screen overlays (chat picker, harness, models) are the same
 * components shown through `TUI.showOverlay(..., { fullscreen: true })`.
 *
 * Global shortcuts: Esc/q/Ctrl+C quit (Esc closes overlays first), Tab focus
 * switch, F1/F2/F3/F5/F6 — see `app-keys.ts`.
 */

import { loadConfig, } from "../config/load";
import { TUI_DEFAULTS, } from "../config/sections/tui";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import { tagsToAnsi, } from "./ansi";
import { bindGlobalKeys, } from "./app-keys";
import { AssetView, } from "./asset-view";
import { API_BASE, ChatWidget, } from "./chat";
import { ChatPicker, } from "./chat-picker";
import { createHarnessView, type HarnessView, } from "./harness";
import { escapeMarkup, } from "./markup";
import { loadPublicProviders, } from "./models-api";
import { formatProviderHealth, HEALTH_UNAVAILABLE, } from "./models-display";
import { ModelsOverlay, } from "./models-overlay";
import {
  type Component,
  type OverlayHandle,
  padding,
  ProcessTerminal,
  truncateToWidth,
  TUI,
  visibleWidth,
} from "./pi";

/** Status line painted when `[tui].enabled` is false; the shell exits right after. */
export const TUI_DISABLED_STATUS = "TUI disabled by config — set [tui].enabled = true to start";

/** Where the TUI's structured log is written; the renderer owns the terminal. */
export const TUI_LOG_PATH = ".tmp/tui/tui.jsonl";

/** Share of the body width the chat column keeps while the sidebar is open. */
const CHAT_WIDTH_SHARE = 0.7;

/** Exported for layout tests; the shell treats it as an internal detail. */
export class AppShell implements Component {
  readonly #chat: ChatWidget;
  readonly #assets: AssetView;
  readonly #terminalRows: () => number;
  #statusRow = "";

  constructor(chat: ChatWidget, assets: AssetView, terminalRows: () => number,) {
    this.#chat = chat;
    this.#assets = assets;
    this.#terminalRows = terminalRows;
  }

  /** Remember the status row so a repaint or resize keeps it on screen. */
  setStatus(row: string,): void {
    this.#statusRow = row;
  }

  /** @param width */
  render(width: number,): readonly string[] {
    const total = Math.max(6, this.#terminalRows(),);
    const bodyHeight = total - 1;

    // Below 25 columns (chat min 20 + divider 1 + sidebar min 4) the split
    // cannot fit; give the chat the full width for this frame and skip the
    // sidebar entirely instead of letting the engine clip it at flush.
    const sidebarVisible = this.#assets.isVisible() && width >= 25;
    const chatWidth = sidebarVisible ? Math.max(20, Math.trunc(width * CHAT_WIDTH_SHARE,),) : width;
    const sidebarWidth = sidebarVisible ? Math.max(4, width - chatWidth - 1,) : 0;

    this.#chat.setBodyHeight(bodyHeight,);
    const left = this.#chat.render(chatWidth,);
    const right = sidebarVisible ? this.#assets.render(sidebarWidth,) : [];

    const rows: string[] = [];
    for (let i = 0; i < bodyHeight; i++) {
      const leftRow = left[i] ?? "";
      const leftPad = Math.max(0, chatWidth - visibleWidth(leftRow,),);
      let row = `${leftRow}${padding(leftPad,)}`;
      if (sidebarVisible) {
        const rightRow = right[i] ?? "";
        const rightPad = Math.max(0, sidebarWidth - visibleWidth(rightRow,),);
        const divider = i === 0 ? "\x1b[33m│\x1b[39m" : "│";
        row += divider + `${rightRow}${padding(rightPad,)}`;
      }

      rows.push(row,);
    }

    // Status bar: blue background across the full width, like the old
    // blessed.text status row.
    const statusText = truncateToWidth(this.#statusRow, Math.max(0, width,),);
    const statusPad = Math.max(0, width - visibleWidth(statusText,),);
    rows.push(`\x1b[37m\x1b[44m${statusText}${padding(statusPad,)}\x1b[0m`,);
    return rows;
  }
}

/** */
export class TUIApp {
  tui: TUI;
  // Definite-assignment: the [tui].enabled gate returns from the constructor
  // before any widget exists. The shell is unusable in that case by design -
  // the process is on its way out and no caller holds the instance.
  chat!: ChatWidget;
  assets!: AssetView;
  harness!: HarnessView;
  chatPicker!: ChatPicker;
  models!: ModelsOverlay;
  private shell!: AppShell;
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

    this.tui = new TUI(new ProcessTerminal(),);

    // [tui].enabled = false is the deployment kill switch (TASK-tui-enabled-
    // config-flag-never-read). Honour it before any widget exists: the engine
    // has not touched the terminal yet, so plain stdout is still ours.
    if (!tuiEnabled) {
      this.tui.stop();
      process.stdout.write(`${TUI_DISABLED_STATUS}\n`,);
      return process.exit(0,);
    }

    const requestRender = (): void => {
      this.tui.requestRender();
    };

    const focus = (target: Component,): void => {
      this.tui.setFocus(target,);
    };

    const viewportRows = (): number => this.tui.terminal.rows;

    this.chat = new ChatWidget({
      sessionToken,
      sendTimeoutMs,
      onFocusRequest: focus,
      onRequestRender: requestRender,
      // After /image or /upload the chat has new assets server-side — the
      // sidebar only loads on chat switch, so reload it here to keep the
      // acceptance flow (generate -> sidebar -> attach) actually reachable.
      onAssetsRefresh: () => {
        void this.assets.loadAssets();
      },
      linkAsset: (assetId,) => this.assets.attachAsset(assetId,),
      onChatChange: (chatId,) => {
        this.assets.setChatId(chatId,);
        this.updateStatus(`chat: ${chatId.slice(0, 8,)}... | F2: assets`,);
        void this.chat.loadMessages();
      },
    },);

    // ── Asset view (right sidebar, toggleable) ─────────────
    this.assets = new AssetView({ sessionToken, onRequestRender: requestRender, },);

    // ── Harness view (full-screen overlay, toggleable) ──────
    this.harness = createHarnessView({
      sessionToken,
      onRequestRender: requestRender,
      getViewportRows: viewportRows,
    },);

    // ── Chat picker (full-screen overlay, toggleable) ───────
    // Selection routes through `chat.setChatId`, the SAME path the web client
    // uses, so the chat's onChatChange callback stays the single place that
    // re-points the asset view and reloads messages. Binding the two views
    // here as well would be the second binding path and they would drift.
    this.chatPicker = new ChatPicker({
      sessionToken,
      onSelect: (chatId,) => {
        this.chatPicker.hide();
        this.chat.setChatId(chatId,);
        this.updateStatus(`chat: ${chatId.slice(0, 8,)}... | F2: assets`,);
      },
      onHide: () => {
        this.chat.focusInput();
      },
      onRequestRender: requestRender,
      getViewportRows: viewportRows,
    },);

    // ── Models overlay (full-screen, toggleable) ────────────
    // Admin model/provider configuration. Reads and writes through the same
    // `config.tui.sessionToken` as every other view, so a 403 here means the
    // token's user lacks admin.system and the overlay says so rather than
    // failing silently.
    this.models = new ModelsOverlay({
      sessionToken,
      onRequestRender: requestRender,
      getViewportRows: viewportRows,
    },);

    // The overlays are components shown through the engine; their show/hide
    // state and the engine handles live in one place.
    this.#wireOverlays();

    this.shell = new AppShell(this.chat, this.assets, viewportRows,);
    this.tui.addChild(this.shell,);

    // ── Global keyboard shortcuts ──────────────────────────
    bindGlobalKeys(this,);

    this.chat.focusInput();
    this.updateStatus(
      "ready — F1: chats | Tab: focus | F2: assets | F3: harness | F5: refresh | F6: models | Esc/q: quit",
    );

    // One fetch after the bar is painted, so the segment fills in without
    // delaying the shell. No timer: a chat client has no business holding a
    // background interval open to redraw a status line.
    this.refreshProviderHealth();

    this.tui.start();
  }

  /** Overlay show/hide plumbing: the engine owns stacking and focus. */
  #wireOverlays(): void {
    for (const overlay of [this.chatPicker, this.harness, this.models,] as const) {
      const originalShow = overlay.show.bind(overlay,);
      const originalHide = overlay.hide.bind(overlay,);
      let handle: OverlayHandle | null = null;
      overlay.show = (): void => {
        if (handle) { handle.setHidden(false,); }
        else {
          handle = this.tui.showOverlay(overlay, { fullscreen: true, anchor: "top-left", },);
        }

        originalShow();
      };

      overlay.hide = (): void => {
        handle?.setHidden(true,);
        originalHide();
      };
    }
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
    const raw = ` Loop Lore  |  ${escapeMarkup(msg,)}${health}  |  ${escapeMarkup(API_BASE,)} `;
    this.shell?.setStatus(tagsToAnsi(raw,),);
    this.tui.requestRender();
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

  /** True while a text field owns the keyboard (chat input, picker prompt). */
  isTyping(): boolean {
    return this.chat.isInputFocused() || this.chatPicker.isPromptOpen();
  }

  // ── Shutdown ───────────────────────────────────────────────

  /**
   * Tear down the renderer and exit. Typed `never` because `process.exit` is:
   * callers can `return` straight after it, and the compiler treats the rest
   * of the branch as unreachable.
   * @returns never — the process is gone before this returns
   */
  shutdown(): never {
    this.tui.stop();
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
 * @returns {TUIApp} the constructed shell, with its renderer and widgets bound
 * @throws if `new TUIApp()` fails — the constructor's own config-load catch
 *   calls `getLogger()`, which throws when no logger is initialized
 */
export function createTUIApp(): TUIApp {
  // `console: false` keeps records in `.tmp/tui/tui.jsonl` only — a console write
  // lands between two rendered frames and corrupts the paint. `setGlobalLogger`
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
