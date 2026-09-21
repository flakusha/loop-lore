// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Composer GIF picker — search a configured GIF provider and insert the
 * pick as a composer attachment.
 *
 * Search runs through the backend proxy (GET /api/v1/gifs/search) so the
 * provider key never reaches the browser. Insert reuses the asset-upload
 * path from handleAttach (POST /api/v1/assets multipart + pendingAssets),
 * so the GIF ships with the next sendMessage like any other attachment.
 *
 * Owner wiring (not this file): merge `gifPicker` into `chatActions` in
 * chat-actions/index.ts, merge `GifPickerState` into `ChatState`, add the
 * composer button + `gifPicker.*` locale keys (see ticket).
 */
import type { GifPickerState, GifResult, } from "../chat-types/gif-picker-state";
import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

export type { GifResult, };

const log = rootLog.child({ module: "gif-picker", },);

/** Results requested per search — bounds provider quota and the DOM list. */
const GIF_SEARCH_LIMIT = 12;

type GifCtx = ChatState & GifPickerState;

export const gifPicker: Partial<GifPickerState> & ThisType<GifCtx> = {
  _gifOpen: false,
  _gifQuery: "",
  _gifResults: [],
  _gifActiveIndex: 0,
  _gifLoading: false,

  openGifPicker() {
    this._gifOpen = true;
    this._gifActiveIndex = 0;
  },

  closeGifPicker() {
    this._gifOpen = false;
  },

  toggleGifPicker() {
    if (this._gifOpen) {
      this.closeGifPicker();
    } else {
      this.openGifPicker();
    }
  },

  async searchGifs() {
    const query = this._gifQuery.trim();
    if (!query || this._gifLoading) {
      return;
    }
    this._gifLoading = true;
    try {
      const res = await apiFetch(
        `/api/v1/gifs/search?q=${encodeURIComponent(query,)}&limit=${GIF_SEARCH_LIMIT}`,
      );
      if (!res.ok) {
        const message = res.status === 501
          ? t("gifPicker.notConfigured",)
          : res.status === 429
          ? t("gifPicker.rateLimited",)
          : t("gifPicker.searchFailed",);
        this.$dispatch?.("show-toast", { type: res.status === 501 ? "info" : "error", message, },);
        return;
      }
      const body = await res.json() as { data?: GifResult[] };
      this._gifResults = Array.isArray(body.data,) ? body.data : [];
      this._gifActiveIndex = 0;
      log.info("GIF search", { query, resultCount: this._gifResults.length, },);
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("gifPicker.searchFailed",), },);
    } finally {
      this._gifLoading = false;
    }
  },

  moveGifSelection(delta: 1 | -1,) {
    const count = this._gifResults.length;
    if (count === 0) {
      return;
    }
    this._gifActiveIndex = (this._gifActiveIndex + delta + count) % count;
  },

  handleGifKey(event: KeyboardEvent,) {
    if (!this._gifOpen) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveGifSelection(1,);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveGifSelection(-1,);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void this.insertGifAtIndex(this._gifActiveIndex,);
    } else if (event.key === "Escape") {
      this.closeGifPicker();
    }
  },

  async insertGifAtIndex(index: number,) {
    const result = this._gifResults[index];
    if (!result) {
      return;
    }
    await this.insertGif(result,);
  },

  async insertGif(result: GifResult,) {
    const filename = `${result.id}.gif`;
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("gifPicker.noActiveChat",), },);
      return;
    }
    try {
      // safeFetch is text/JSON-only; the GIF binary re-upload needs Response.blob().
      // eslint-disable-next-line no-restricted-syntax
      const downloaded = await fetch(result.url,);
      if (!downloaded.ok) {
        this.$dispatch?.("show-toast", { type: "error", message: t("gifPicker.downloadFailed",), },);
        return;
      }
      const blob = await downloaded.blob();
      const formData = new FormData();
      formData.append("file", new File([blob,], filename, { type: "image/gif", },),);
      formData.append("alt_text", result.title || filename,);
      const res = await apiFetch("/api/v1/assets", { method: "POST", body: formData, },);
      if (!res.ok) {
        const err = await res.json().catch(() => null) as { error?: string } | null;
        this.$dispatch?.("show-toast", {
          type: "error",
          message: err?.error ?? t("gifPicker.attachFailed", { filename, },),
        },);
        return;
      }
      const asset = await res.json() as { id: string };
      this.pendingAssets = [...this.pendingAssets, { assetId: asset.id, filename, },];
      this._gifOpen = false;
      log.info("GIF attached", { assetId: asset.id, filename, },);
      this.$dispatch?.("show-toast", {
        type: "success",
        message: t("gifPicker.attached", { filename, },),
      },);
    } catch {
      this.$dispatch?.("show-toast", {
        type: "error",
        message: t("gifPicker.attachFailed", { filename, },),
      },);
    }
  },
};
