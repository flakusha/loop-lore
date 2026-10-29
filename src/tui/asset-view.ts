// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 320
/**
 * TUI Asset View (pi-tui)
 *
 * Right-sidebar component browsing assets linked to the current chat.
 * Left/Right arrow navigation, Enter attaches the selected asset. The shell
 * routes those keys here while the sidebar is visible and the chat input does
 * not own the keyboard (the same gating the old screen-level keys had).
 * Fetches from GET /api/assets?entity_type=chat&entity_id=...
 */

import { safeFetch, } from "../utils";
import { tagsToAnsi, } from "./ansi";
import { API_BASE, } from "./chat";
import { renderFramed, } from "./frame";
import { escapeMarkup, } from "./markup";
import { type Component, type Focusable, } from "./pi";

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
  /** Repaint hook; the shell routes this to the pi-tui renderer. */
  onRequestRender?: () => void;
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

/** Sidebar body rows for the current asset, in blessed-tag form. */
function assetRows(asset: LinkedAsset, index: number, count: number,): string[] {
  const sizeStr = formatSize(asset.size_bytes,);
  const rows = [
    `Asset {bold}${index + 1}{/bold} of {bold}${count}{/bold}`,
    "",
    `{bold}Name:{/bold} ${escapeMarkup(asset.filename,)}`,
    `{bold}Type:{/bold} ${escapeMarkup(asset.asset_type,)}`,
    `{bold}MIME:{/bold} ${escapeMarkup(asset.mime_type,)}`,
    `{bold}Size:{/bold} ${sizeStr}`,
    `{bold}Added:{/bold} ${asset.created_at.slice(0, 10,)}`,
  ];

  if (asset.alt_text) {
    rows.push(`{bold}Alt:{/bold} ${escapeMarkup(asset.alt_text,)}`,);
  }

  rows.push("", "{cyan-fg}← → navigate{/cyan-fg}",);
  return rows;
}

/**
 * @param bytes - raw byte count
 * @returns human-readable size (`B` / `KB` / `MB`).
 */
function formatSize(bytes: number,): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1,)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(1,)} MB`;
}

/** */
export class AssetView implements Component, Focusable {
  focused = false;
  /** Bordered-frame body rows, or a single info line; recomputed on changes. */
  private rows: string[] = ["No assets loaded.",];
  private assets: LinkedAsset[] = [];
  private currentIndex = 0;
  private chatId: string | null = null;
  private visibleFlag = false;
  private sessionToken: string | undefined;
  private readonly requestRender: () => void;

  /**
   * @param options - bearer token and repaint hook
   */
  constructor(options: AssetViewOptions = {},) {
    // An empty string would ship as a bare `Bearer ` and trip a 401.
    this.sessionToken = options.sessionToken === "" ? undefined : options.sessionToken;
    this.requestRender = options.onRequestRender ?? ((): void => {
      /* no host wired: tests read render() directly */
    });
  }

  /** @param width */
  render(width: number,): readonly string[] {
    if (!this.visibleFlag) { return []; }
    const body = this.rows.map((row,) => tagsToAnsi(row,));
    return renderFramed({ title: "Assets", rows: body, width, color: "yellow", },);
  }

  /**
   * Left/Right cycle, Enter attaches. Routed by the shell (and reachable
   * directly when the sidebar itself holds focus).
   * @param data - raw key data from pi-tui
   */
  handleInput(data: string,): void {
    if (!this.visibleFlag || this.assets.length === 0) { return; }
    if (data === "\x1b[D" || data === "\x1b[C") {
      const dir = data === "\x1b[D" ? -1 : 1;
      this.currentIndex = (this.currentIndex + dir + this.assets.length) % this.assets.length;
      this.renderCurrent();
    } else if (data === "\r" || data === "\n") {
      const asset = this.assets[this.currentIndex]!;
      void this.attachAsset(asset.id,);
    }
  }

  // ── Rendering ───────────────────────────────────────────────

  /** */
  private renderCurrent(): void {
    if (this.assets.length === 0) {
      this.renderInfo("No assets linked to this chat.",);
      return;
    }

    const asset = this.assets[this.currentIndex]!;
    this.rows = assetRows(asset, this.currentIndex, this.assets.length,);
    this.requestRender();
  }

  /**
   * @param msg
   */
  private renderInfo(msg: string,): void {
    this.rows = [msg,];
    this.requestRender();
  }

  // ── Public API ──────────────────────────────────────────────

  /** Show the asset-view sidebar. */
  show(): void {
    this.visibleFlag = true;
    this.requestRender();
  }

  /** Hide the asset-view sidebar. */
  hide(): void {
    this.visibleFlag = false;
    this.requestRender();
  }

  /** Toggle sidebar visibility. */
  toggle(): void {
    if (this.visibleFlag) {
      this.hide();
    } else {
      this.show();
    }
  }

  /** @returns `true` when the sidebar is currently visible. */
  isVisible(): boolean {
    return this.visibleFlag;
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
   * @returns the currently highlighted asset, or `undefined` when none.
   */
  getCurrentAsset(): LinkedAsset | undefined {
    return this.assets[this.currentIndex];
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
          // No `label`: the server writes `label: "generated"` for its own
          // image-gen output (`image-gen-route.ts`) — a manual attach is not
          // a generation, and stamping it as one would corrupt that signal.
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

  /** Load assets for the current chat into the sidebar's backing list. */
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
