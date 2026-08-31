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
import { getLogger, } from "../logger";
import { AssetView, } from "./asset-view";
import { ChatWidget, } from "./chat";

const API_BASE = process.env.LOOP_LORE_API_BASE_URL ?? "http://localhost:3000";

/** */
export class TUIApp {
  private statusBar: blessed.Widgets.TextElement;
  screen: blessed.Widgets.Screen;
  chat: ChatWidget;
  assets: AssetView;

  /** */
  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: "Loop Lore TUI",
      dockBorders: true,
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

    // ── Chat widget (main area, above status bar) ──────────
    // Pass callback for chat change events
    this.chat = new ChatWidget(this.screen, {
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

const app = new TUIApp();
export default app;
