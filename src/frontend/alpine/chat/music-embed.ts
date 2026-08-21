// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music embed renderer — returns sanitized iframe HTML for music link messages.
 */
import type { ChatState, } from "../types";
import type { MusicLinkMessage, } from "../chat-types/messages";

export type ChatMusicEmbed = Pick<ChatState, never>;

const getDOMPurify = () => (globalThis as { __DOMPurify?: { sanitize: (html: string, config: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] }) => string } }).__DOMPurify;

const NSFW_PLACEHOLDER = '<span class="music-embed-nsfw">🔒 Explicit content hidden</span>';

export const chatMusicEmbed: ChatMusicEmbed = {
  renderMusicEmbed(msg: MusicLinkMessage): string {
    const DOMPurify = getDOMPurify();

    if (msg.nsfwHidden) {
      return NSFW_PLACEHOLDER;
    }

    if (!msg.embedHtml) {
      // Fallback: render a linked title card
      const thumb = msg.thumbnailUrl
        ? `<img src="${msg.thumbnailUrl}" alt="${msg.title}" class="music-embed-thumb" />`
        : "";
      return `<div class="music-embed-card">
        ${thumb}
        <a href="${msg.serviceUrl}" target="_blank" rel="noopener" class="music-embed-link">
          ${msg.title} — ${msg.artist}
        </a>
      </div>`;
    }

    if (!DOMPurify) { return msg.embedHtml; }

    return DOMPurify.sanitize(msg.embedHtml, {
      ALLOWED_TAGS: ["iframe", "span"],
      ALLOWED_ATTR: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "scrolling"],
    });
  },
};
