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
import { createLogger, getLogger, } from "../logger";
import { AssetView, } from "./asset-view";
import { API_BASE, ChatWidget, } from "./chat";

/** */
export class TUIApp {
  private statusBar: blessed.Widgets.TextElement;
  screen: blessed.Widgets.Screen;
  chat: ChatWidget;
  assets: AssetView;

  /** */
  constructor() {
    // Load config once at startup to pick up [tui].sessionToken. A
    // failed load (no config file, parse error, etc.) must not crash
    // the TUI — log and fall back to anonymous mode (solo deployments
    // ignore missing tokens).
    let sessionToken: string | undefined;
    try {
      const config = loadConfig();
      sessionToken = config.tui.sessionToken;
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
    this.chat = new ChatWidget(this.screen, {
      sessionToken,
      onChatChange: (chatId,) => {
        this.assets.setChatId(chatId,);
        this.updateStatus(`chat: ${chatId.slice(0, 8,)}... | F2: assets`,);
        void this.chat.loadMessages();
      },
    },);

    // ── Asset view (right sidebar, toggleable) ─────────────
    this.assets = new AssetView(this.screen,);

    // ── Resize handler ─────────────────────────────────────
    this.screen.on("resize", () => {
      this.screen.render();
    },);

    // ── Global keyboard shortcuts ──────────────────────────
    this.screen.key(["escape", "q", "C-c",], () => {
      this.shutdown();
    },);

    // F2 — toggle asset sidebar
    this.screen.key(["f2",], () => {
      this.assets.toggle();
      this.updateStatus(this.assets.isVisible() ? "Assets: visible" : "Assets: hidden",);
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

    this.updateStatus("ready — Tab: focus | F2: assets | F5: refresh | Esc/q: quit",);

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

  /** */
  shutdown(): void {
    this.screen.destroy();
    process.exit(0,);
  }
}

// Initialize the global logger before module-scope TUIApp construction.
// The constructor calls loadConfig(), which logs via getLogger(); without
// this init, a config failure crashes the TUI inside its own catch block
// (see BUG-tui-app-getlogger-throws-when-running-standalone).
createLogger({ level: "warn", },);

const app = new TUIApp();
export default app;
