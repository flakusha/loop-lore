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
import { createLogger, getLogger, } from "../logger";
import { AssetView, } from "./asset-view";
import { API_BASE, ChatWidget, } from "./chat";
import { ChatPicker, } from "./chat-picker";
import { createHarnessView, type HarnessView, } from "./harness";
import { ModelsOverlay, } from "./models-overlay";

/** Status line painted when `[tui].enabled` is false; the shell exits right after. */
export const TUI_DISABLED_STATUS = "TUI disabled by config — set [tui].enabled = true to start";

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
      onChatChange: (chatId,) => {
        this.assets.setChatId(chatId,);
        this.updateStatus(`chat: ${chatId.slice(0, 8,)}... | F2: assets`,);
        void this.chat.loadMessages();
      },
    },);

    // ── Asset view (right sidebar, toggleable) ─────────────
    this.assets = new AssetView(this.screen, { sessionToken, },);

    // ── Harness view (full-screen overlay, toggleable) ──────
    this.harness = createHarnessView(this.screen, sessionToken,);

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
    this.screen.key(["escape", "q", "C-c",], () => {
      // An open overlay swallows the key: Esc closes the picker rather than
      // killing the process. With nothing open, the key quits as before.
      if (this.chatPicker.dismiss()) { return; }
      if (this.models.dismiss()) { return; }
      this.shutdown();
    },);

    // F1 — toggle the chat picker. F2/F3 are the asset/harness toggles, F4 is
    // reserved by TASK-harness-topic-tui-surface, F5 is refresh.
    this.screen.key(["f1",], () => {
      if (this.chatPicker.isVisible()) {
        this.chatPicker.hide();
      } else {
        this.chatPicker.show();
      }
    },);

    // F2 — toggle asset sidebar
    this.screen.key(["f2",], () => {
      this.assets.toggle();
      this.updateStatus(this.assets.isVisible() ? "Assets: visible" : "Assets: hidden",);
    },);

    // F3 — toggle harness view
    this.screen.key(["f3",], () => {
      this.harness.toggle();
      this.updateStatus(this.harness.isVisible() ? "Harness: visible" : "Harness: hidden",);
    },);

    // F6 — toggle the models overlay. F4 stays reserved by
    // TASK-harness-topic-tui-surface; F6 is the next free key in this block.
    this.screen.key(["f6",], () => {
      if (this.models.isVisible()) {
        this.models.hide();
      } else {
        this.models.show();
      }
    },);

    // F5 — refresh current chat messages
    this.screen.key(["f5",], () => {
      void (async () => {
        const chatId = this.chat.getChatId();
        if (chatId) {
          this.updateStatus("refreshing messages...",);
          try {
            await this.chat.loadMessages();
            this.updateStatus(`chat: ${chatId.slice(0, 8,)}...`,);
          } catch (error: unknown) {
            getLogger()
              .child({ module: "tui", },)
              .error("loadMessages failed", error instanceof Error ? error : new Error(String(error,),),);

            this.updateStatus("load failed",);
          }
        } else {
          this.updateStatus("no active chat",);
        }
      })();
    },);

    // Ctrl+L — clear messages display
    this.screen.key(["C-l",], () => {
      this.chat.clearMessages();
      this.updateStatus("display cleared",);
    },);

    this.updateStatus(
      "ready — F1: chats | Tab: focus | F2: assets | F3: harness | F5: refresh | F6: models | Esc/q: quit",
    );

    this.screen.render();
  }

  // ── Status bar ─────────────────────────────────────────────

  /**
   * @param msg
   */
  private updateStatus(msg: string,): void {
    this.statusBar.setContent(` {bold}Loop Lore{/bold}  |  ${msg}  |  API: ${API_BASE}  `,);
    this.screen.render();
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
  createLogger({ level: "warn", },);
  return new TUIApp();
}

// Entry-point guard — the idiom every script under scripts/ uses. The TUI
// still auto-starts under `bun run src/tui/app.ts`, and stays inert when a
// test runner or any other tool imports the module.
if (import.meta.main) {
  createTUIApp();
}
