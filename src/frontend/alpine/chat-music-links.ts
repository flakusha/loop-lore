// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Chat music links (list / add / delete) — panel ─
import type { ChatMusicLinksState, MusicLinkRow, } from "./chat-types/music-links-state";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-music-links", },);

export const chatMusicLinks: Partial<ChatState & ChatMusicLinksState> & ThisType<ChatState & ChatMusicLinksState> = {
  _musicLinks: [] as MusicLinkRow[],
  _musicLinksLoading: false,
  _musicLinksConfirmDelete: null as string | null,
  _musicLinkUrl: "",
  _musicLinkError: "",
  _musicLinkSaving: false,

  /**
   * @returns {void}
   */
  toggleMusicLinksPanel() {
    const store = (window as { Alpine?: { store: (n: string,) => Record<string, unknown> } }).Alpine?.store("ui",) as
      | Record<string, boolean>
      | undefined;

    if (store && "showMusicLinksPanel" in store) {
      store.showMusicLinksPanel = !store.showMusicLinksPanel;
    }

    this._musicLinks = [];
    this._musicLinksConfirmDelete = null;
    this._musicLinkUrl = "";
    this._musicLinkError = "";
    if (store?.showMusicLinksPanel && this.activeChat) {
      void this.loadMusicLinks();
    }
  },

  /**
   * @returns {Promise<void>}
   */
  async loadMusicLinks() {
    if (!this.activeChat) { return; }
    this._musicLinksLoading = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/music-links`,);
      if (res.ok) {
        const body = await res.json();
        this._musicLinks = (body.data as MusicLinkRow[]) ?? [];
      }
    } catch (error) {
      log.warn("loadMusicLinks failed", { error: String(error,), },);
    }

    this._musicLinksLoading = false;
  },

  /**
   * @returns {Promise<void>}
   */
  async addMusicLink() {
    if (!this.activeChat || !this._musicLinkUrl) { return; }
    this._musicLinkError = "";
    this._musicLinkSaving = true;
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/music-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ url: this._musicLinkUrl.trim(), },),
      },);

      if (res.ok) {
        this._musicLinkUrl = "";
        await this.loadMusicLinks();
      } else {
        const err = await res.json().catch(() => ({ error: "Failed to add music link", })) as { error?: string };
        this._musicLinkError = err.error ?? "Failed to add music link";
      }
    } catch (error) {
      log.warn("addMusicLink failed", { error: String(error,), },);
      this._musicLinkError = "Network error";
    }

    this._musicLinkSaving = false;
  },

  /**
   * @param {string} id
   * @returns {void}
   */
  confirmDeleteMusicLink(id: string,) {
    this._musicLinksConfirmDelete = id;
  },

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteMusicLink(id: string,) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/v1/music-links/${id}`, {
        method: "DELETE",
      },);

      if (res.ok) {
        this._musicLinksConfirmDelete = null;
        await this.loadMusicLinks();
      }
    } catch (error) {
      log.warn("deleteMusicLink failed", { error: String(error,), },);
    }
  },
};
