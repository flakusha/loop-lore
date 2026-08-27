// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music embed renderer — returns sanitized iframe HTML for music link messages.
 */
import type { MusicLinkMessage, } from "../chat-types/messages";
import type { ChatState, } from "../types";

export type ChatMusicEmbed = Pick<ChatState, never>;

const getDOMPurify = () =>
  (globalThis as {
    __DOMPurify?: { sanitize: (html: string, config: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] },) => string };
  }).__DOMPurify;

const NSFW_PLACEHOLDER = '<span class="music-embed-nsfw">🔒 Explicit content hidden</span>';
const EMBED_UNAVAILABLE = '<span class="music-embed-error">⚠️ Embed unavailable (sanitizer missing)</span>';

/**
 * Escape a value for safe HTML interpolation.
 * 4 call sites in renderMusicEmbed — extracted for lockstep behavior.
 */
const esc = (s: string | null | undefined,): string => {
  const div = document.createElement("div",);
  div.textContent = s ?? "";
  return div.getHTML();
};

export const chatMusicEmbed: ChatMusicEmbed = {
  renderMusicEmbed(msg: MusicLinkMessage,): string {
    const DOMPurify = getDOMPurify();

    if (msg.nsfwHidden) {
      return NSFW_PLACEHOLDER;
    }

    if (!msg.embedHtml) {
      // Fallback: render a linked title card with escaped values to prevent
      // stored XSS from LLM/regex-extracted metadata (thumbnailUrl/title/artist/serviceUrl).
      const thumb = msg.thumbnailUrl
        ? `<img src="${esc(msg.thumbnailUrl,)}" alt="${esc(msg.title,)}" class="music-embed-thumb" />`
        : "";
      return `<div class="music-embed-card">
        ${thumb}
        <a href="${esc(msg.serviceUrl,)}" target="_blank" rel="noopener" class="music-embed-link">
          ${esc(msg.title,)} — ${esc(msg.artist,)}
        </a>
      </div>`;
    }

    // Fail-closed: without DOMPurify we must not inject raw embed HTML —
    // return a placeholder instead.
    if (!DOMPurify) {
      return EMBED_UNAVAILABLE;
    }

    return DOMPurify.sanitize(msg.embedHtml, {
      ALLOWED_TAGS: ["iframe", "span",],
      ALLOWED_ATTR: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "scrolling",],
    },);
  },
};
