// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TUI Asset View
 *
 * Blessed widget for browsing assets linked to the current chat.
 * Left/Right arrow navigation, Enter/Delete interaction.
 * Fetches from GET /api/assets?entity_type=chat&entity_id=...
 */

import blessed from "blessed";
import { safeFetch, } from "../utils";
import { API_BASE, } from "./chat";

/** */
export interface LinkedAsset {
  id: string;
  filename: string;
  mime_type: string;
  asset_type: string;
  size_bytes: number;
  alt_text: string | null;
  created_at: string;
}

/** */
export class AssetView {
  private screen: blessed.Widgets.Screen;
  private box: blessed.Widgets.BoxElement;
  private infoLabel: blessed.Widgets.BlessedElement;
  private assets: LinkedAsset[] = [];
  private currentIndex = 0;
  private chatId: string | null = null;
  private assetCountLabel: blessed.Widgets.BlessedElement;

  /**
   * @param screen
   * @param parent
   */
  constructor(screen: blessed.Widgets.Screen, parent?: blessed.Widgets.BoxElement,) {
    this.screen = screen;

    this.box = blessed.box({
      parent: parent ?? screen,
      right: 0,
      top: 0,
      width: "30%",
      height: "100%",
      label: " {bold}Assets{/bold} ",
      tags: true,
      border: { type: "line", },
      style: { bg: "black", fg: "white", border: { fg: "yellow", }, },
      scrollable: true,
      hidden: true,
    },);

    this.assetCountLabel = blessed.text({
      parent: this.box,
      top: 1,
      left: 1,
      tags: true,
      content: "",
      style: { fg: "cyan", },
    },);

    this.infoLabel = blessed.text({
      parent: this.box,
      top: 3,
      left: 1,
      right: 1,
      tags: true,
      content: "No assets loaded.",
      style: { fg: "white", },
    },);

    // Navigation: left/right cycle through assets
    screen.key(["left", "right",], (_ch: string, key: { name: string },) => {
      if (!this.box.visible || this.assets.length === 0) { return; }
      this.currentIndex = (key.name === "left" ? this.currentIndex - 1 + this.assets.length : this.currentIndex + 1) %
        this.assets.length;
      this.renderCurrent();
      screen.render();
    },);
  }

  // ── Rendering ───────────────────────────────────────────────

  /** */
  private renderCurrent(): void {
    if (this.assets.length === 0) {
      this.renderInfo("No assets linked to this chat.",);
      return;
    }

    const asset = this.assets[this.currentIndex]!;
    const sizeStr = this.formatSize(asset.size_bytes,);

    this.assetCountLabel.setContent(
      `Asset {bold}${this.currentIndex + 1}{/bold} of {bold}${this.assets.length}{/bold}`,
    );

    this.infoLabel.setContent(
      `{bold}Name:{/bold} ${asset.filename}\n` +
        `{bold}Type:{/bold} ${asset.asset_type}\n` +
        `{bold}MIME:{/bold} ${asset.mime_type}\n` +
        `{bold}Size:{/bold} ${sizeStr}\n` +
        `{bold}Added:{/bold} ${asset.created_at.slice(0, 10,)}\n${
          asset.alt_text ? `{bold}Alt:{/bold} ${asset.alt_text}\n` : ""
        }\n{cyan-fg}← → navigate   Del: unlink{/cyan-fg}`,
    );

    this.screen.render();
  }

  /**
   * @param msg
   */
  private renderInfo(msg: string,): void {
    this.assetCountLabel.setContent("",);
    this.infoLabel.setContent(msg,);
    this.screen.render();
  }

  /**
   * @param bytes
   */
  private formatSize(bytes: number,): string {
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1,)} KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1,)} MB`;
  }

  // ── Public API ──────────────────────────────────────────────

  /** */
  show(): void {
    this.box.show();
    this.screen.render();
  }

  /** */
  hide(): void {
    this.box.hide();
    this.screen.render();
  }

  /** */
  toggle(): void {
    if (this.box.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /** */
  isVisible(): boolean {
    return this.box.visible;
  }

  /**
   * @param chatId
   */
  setChatId(chatId: string,): void {
    this.chatId = chatId;
    this.currentIndex = 0;
    void (async () => {
      try {
        await this.loadAssets();
      } catch {
        /* non-critical */
      }
    })();
  }

  /** */
  getChatId(): string | null {
    return this.chatId;
  }

  // ── Data loading ────────────────────────────────────────────

  /** */
  async loadAssets(): Promise<void> {
    if (!this.chatId) {
      this.assets = [];
      this.renderInfo("No active chat.",);
      return;
    }

    try {
      const url = `${API_BASE}/api/assets?entity_type=chat&entity_id=${this.chatId}&pageSize=100`;
      const result = await safeFetch<{ data?: LinkedAsset[] }>(url, {
        handle401: false,
      },);
      if (!result.ok) {
        this.renderInfo(
          result.status !== undefined
            ? `Failed to load (HTTP ${result.status})`
            : `Error: ${result.error.message}`,
        );
        return;
      }
      this.assets = result.data.data ?? [];
      this.currentIndex = 0;
      this.renderCurrent();
    } catch (error) {
      this.assets = [];
      this.renderInfo(`Error: ${(error as Error).message}`,);
    }
  }

  /** Reload assets for the current chat (e.g., after upload). */
  async refresh(): Promise<void> {
    await this.loadAssets();
  }
}
