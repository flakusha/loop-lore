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
import { escapeMarkup, } from "./markup";

let _fetch = safeFetch;

/**
 * Swap the asset-list fetcher. Tests use this instead of `mock.module`.
 * @param fn - replacement for the real `safeFetch`
 */
export function setFetch(fn: typeof safeFetch,): void {
  _fetch = fn;
}

/** Construction options for {@link AssetView}. */
export interface AssetViewOptions {
  /** Bearer token for the assets call; omit to run anonymous. */
  sessionToken?: string;
  /** Explicit parent box; defaults to the screen. */
  parent?: blessed.Widgets.BoxElement;
}

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
  private sessionToken: string | undefined;

  /**
   * @param screen - surface the sidebar is drawn on
   * @param options - bearer token and optional parent box
   */
  constructor(screen: blessed.Widgets.Screen, options: AssetViewOptions = {},) {
    this.screen = screen;
    // An empty string would ship as a bare `Bearer ` and trip a 401.
    this.sessionToken = options.sessionToken === "" ? undefined : options.sessionToken;

    this.box = blessed.box({
      parent: options.parent ?? screen,
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

    // Enter attaches the selected asset to the active chat so a later message
    // send can carry it. While the input box is reading it holds
    // `screen.grabKeys` (and Enter is not in `ignoreLocked`), so this only
    // fires when focus is off the input — no conflict with sending.
    screen.key(["enter",], () => {
      if (!this.box.visible || this.assets.length === 0) { return; }
      const asset = this.assets[this.currentIndex]!;
      void this.attachAsset(asset.id,);
    },);
  }

  // ── Rendering ───────────────────────────────────────────────

  /** */
  /**
   * @returns {void}
   */
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
      `{bold}Name:{/bold} ${escapeMarkup(asset.filename,)}\n` +
        `{bold}Type:{/bold} ${escapeMarkup(asset.asset_type,)}\n` +
        `{bold}MIME:{/bold} ${escapeMarkup(asset.mime_type,)}\n` +
        `{bold}Size:{/bold} ${sizeStr}\n` +
        `{bold}Added:{/bold} ${asset.created_at.slice(0, 10,)}\n${
          asset.alt_text ? `{bold}Alt:{/bold} ${escapeMarkup(asset.alt_text,)}\n` : ""
        }\n{cyan-fg}← → navigate{/cyan-fg}`,
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
   * @param bytes - raw byte count
   * @returns human-readable size (`B` / `KB` / `MB`).
   */
  private formatSize(bytes: number,): string {
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1,)} KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(1,)} MB`;
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Show the asset-view box and re-render the screen.
   */
  show(): void {
    this.box.show();
    this.screen.render();
  }

  /**
   * Hide the asset-view box and re-render the screen.
   */
  hide(): void {
    this.box.hide();
    this.screen.render();
  }

  /**
   * @returns `true` when the box is currently visible.
   */
  toggle(): void {
    if (this.box.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * @returns `true` when the asset-view box is currently visible.
   */
  isVisible(): boolean {
    return this.box.visible;
  }

  /**
   * @param chatId - chat whose assets should be displayed
   */
  setChatId(chatId: string,): void {
    this.chatId = chatId;
    this.currentIndex = 0;
    // loadAssets surfaces failures via renderInfo and never rejects.
    void this.loadAssets();
  }

  /**
   * @returns currently-scoped chat id, or `null` when none.
   */
  getChatId(): string | null {
    return this.chatId;
  }

  /**
   * Link an asset to the active chat (`POST /api/v1/assets/:id/links`).
   *
   * The server's link row is what the chat-scoped sidebar list reads, so an
   * uploaded or generated image becomes a chat attachment this way. Refreshes
   * the list on success; failures surface as an info line, never a throw.
   * @param assetId - asset to attach to the active chat
   * @returns `true` when the link was created
   */
  async attachAsset(assetId: string,): Promise<boolean> {
    if (!this.chatId) {
      this.renderInfo("No active chat.",);
      return false;
    }

    try {
      const result = await _fetch(
        `${API_BASE}/api/v1/assets/${encodeURIComponent(assetId,)}/links`,
        {
          method: "POST",
          auth: this.sessionToken ? { sessionToken: this.sessionToken, } : undefined,
          body: { entityType: "chat", entityId: this.chatId, },
          handle401: false,
        },
      );

      if (!result.ok) {
        this.renderInfo(
          result.status !== undefined
            ? `Attach failed (HTTP ${result.status})`
            : `Error: ${result.error.message}`,
        );

        return false;
      }

      await this.loadAssets();
      this.renderInfo("Attached to this chat.",);
      return true;
    } catch (error) {
      this.renderInfo(`Error: ${(error as Error).message}`,);
      return false;
    }
  }

  // ── Data loading ────────────────────────────────────────────

  /** Load assets for the current chat into the asset-view's backing list. */
  /**
   * @returns {Promise<void>}
   */
  async loadAssets(): Promise<void> {
    if (!this.chatId) {
      this.assets = [];
      this.renderInfo("No active chat.",);
      return;
    }

    try {
      const url = `${API_BASE}/api/v1/assets?entity_type=chat&entity_id=${
        encodeURIComponent(this.chatId,)
      }&pageSize=100`;

      const result = await _fetch<{ data?: LinkedAsset[] }>(url, {
        auth: this.sessionToken ? { sessionToken: this.sessionToken, } : undefined,
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
}
