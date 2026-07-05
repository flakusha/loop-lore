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
import { ChatWidget, API_BASE } from "./chat";
import { AssetView } from "./asset-view";

export class TUIApp {
  private statusBar: blessed.Widgets.TextElement;
  screen: blessed.Widgets.Screen;
  chat: ChatWidget;
  assets: AssetView;

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: "Loop Lore TUI",
      dockBorders: true,
    });

    // ── Status bar (bottom) ─────────────────────────────────
    this.statusBar = blessed.text({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      content: "",
      tags: true,
      style: { bg: "blue", fg: "white" },
    });
    this.updateStatus("initializing...");

    // ── Chat widget (main area, above status bar) ──────────
    this.chat = new ChatWidget(this.screen);

    // ── Asset view (right sidebar, toggleable) ─────────────
    this.assets = new AssetView(this.screen);

    // ── Resize handler ─────────────────────────────────────
    this.screen.on("resize", () => {
      this.screen.render();
    });

    // ── Global keyboard shortcuts ──────────────────────────
    this.screen.key(["escape", "q", "C-c"], () => {
      this.shutdown();
    });

    // F2 — toggle asset sidebar
    this.screen.key(["f2"], () => {
      this.assets.toggle();
      this.updateStatus(
        this.assets.isVisible() ? "Assets: visible" : "Assets: hidden",
      );
    });

    // F5 — refresh current chat messages
    this.screen.key(["f5"], () => {
      const chatId = this.chat.getChatId();
      if (chatId) {
        this.updateStatus("refreshing messages...");
        void this.chat.loadMessages()
          .then(() => {
            this.updateStatus(`chat: ${chatId.slice(0, 8)}...`);
          })
          .catch((err: Error) => console.error("[tui] loadMessages failed:", err));
      } else {
        this.updateStatus("no active chat");
      }
    });

    // Ctrl+L — clear messages display
    this.screen.key(["C-l"], () => {
      this.chat.clearMessages();
      this.updateStatus("display cleared");
    });

    // ── Auto-update status when chat changes ───────────────
    // TODO: replace monkey-patch with event-based approach (EventEmitter on ChatWidget)
    const origSetChatId = this.chat.setChatId.bind(this.chat);
    this.chat.setChatId = (chatId: string) => {
      origSetChatId(chatId);
      this.assets.setChatId(chatId);
      this.updateStatus(`chat: ${chatId.slice(0, 8)}... | F2: assets`);
      // Load messages for the selected chat
      void this.chat.loadMessages();
    };

    this.updateStatus("ready — Tab: focus | F2: assets | F5: refresh | Esc/q: quit");

    this.screen.render();
  }

  // ── Status bar ─────────────────────────────────────────────

  private updateStatus(msg: string): void {
    const apiStatus = API_BASE;
    // eslint-disable-next-line unicorn/no-incorrect-template-string-interpolation
    this.statusBar.setContent(` {bold}Loop Lore{/bold}  |  ${msg}  |  API: ${apiStatus}  `);
    this.screen.render();
  }

  // ── Shutdown ───────────────────────────────────────────────

  shutdown(): void {
    this.screen.destroy();
    process.exit(0);
  }
}

const app = new TUIApp();
export default app;
