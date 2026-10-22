// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generic link-preview methods for chat messages (TASK-link-previews-unfurl).
 *
 * The Alpine template asks for a preview URL per message; results cache in
 * `_linkPreviews` and render via x-text/:src only (never innerHTML).
 * Music links are excluded here — chat-music-links owns their rendering.
 */
import type { ChatState, LinkPreviewState, Message, } from "./types";

/** URL detection: first http(s) URL in message text. */
const URL_RE = /https?:\/\/[^\s<>()"']+/;

/** Music domains handled by the dedicated music-embed path. */
const MUSIC_HOSTS = [
  "spotify.com",
  "music.youtube.com",
  "soundcloud.com",
  "bandcamp.com",
  "music.apple.com",
];

/** */
function isMusicHost(url: string,): boolean {
  try {
    const host = new URL(url,).hostname.toLowerCase();
    return MUSIC_HOSTS.some((d,) => host === d || host.endsWith(`.${d}`,));
  } catch {
    return true;
  }
}

export const chatLinkPreviewMethods: Partial<ChatState> & ThisType<ChatState> = {
  /** */
  _linkPreviews: {} as LinkPreviewState["_linkPreviews"],

  /**
   * The generic URL a message should show a preview card for, if any.
   * @param {Message} msg
   */
  linkPreviewUrlFor(msg: Message,) {
    if (msg.content_type === "tool_result") { return null; }
    const match = URL_RE.exec(msg.content,);
    if (!match) { return null; }
    const url = match[0];
    return isMusicHost(url,) ? null : url;
  },

  /**
   * Fetch (or reuse the cached) preview for a message's URL.
   * @param {string} url
   * @returns {Promise<void>}
   */
  async loadLinkPreview(url: string,) {
    const chatId = this.activeChat;
    if (!chatId || this._linkPreviews[url]) { return; }
    // Reserve the slot so parallel renders do not double-fetch.
    this._linkPreviews[url] = { state: "loading", };
    try {
      const res = await apiFetch(
        `/api/v1/chats/${chatId}/link-preview?url=${encodeURIComponent(url,)}`,
      );

      if (!res.ok) {
        this._linkPreviews[url] = { state: "failed", };
        return;
      }

      const data = (await res.json()) as {
        title: string | null;
        description: string | null;
        imageUrl: string | null;
      };

      this._linkPreviews[url] = { state: "ready", ...data, };
    } catch {
      this._linkPreviews[url] = { state: "failed", };
    }
  },
};
