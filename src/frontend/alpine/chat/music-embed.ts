// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music embed renderer — returns sanitized iframe HTML for music link messages.
 *
 * XSS defense layers used by the fallback card interpolation:
 *   - `escText` escapes `& < >` for safe insertion as child text.
 *   - `escAttr` further escapes `"` for safe insertion inside a double-quoted
 *     attribute value (closes the attribute-breakout vector that the previous
 *     `esc()` missed when interpolating into `src=` / `href=`).
 *   - `safeUrl` enforces an http(s)/mailto scheme allowlist for navigation
 *     targets so `javascript:` and `data:` URLs cannot reach rendered markup
 *     (closes the URL-scheme vector that previously slipped through the same
 *     helper). Non-matching URLs are rewritten to a benign `#blocked` anchor.
 *
 * All three helpers are exported so they can be unit-tested without a DOM.
 */
import type { MusicLinkMessage, } from "../chat-types/messages";
import type { ChatState, } from "../types";

/** */
export type ChatMusicEmbed = Pick<ChatState, never>;

const getDOMPurify = () =>
  (globalThis as {
    __DOMPurify?: { sanitize: (html: string, config: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] },) => string };
  }).__DOMPurify;

const NSFW_PLACEHOLDER = '<span class="music-embed-nsfw">🔒 Explicit content hidden</span>';

const SAFE_URL = /^(?:https?:\/\/|mailto:)/i;

/** Escape `& < >` for safe insertion as HTML child text. */
export const escText = (s: string | null | undefined,): string =>
  (s ?? "").replaceAll("&", "&amp;",).replaceAll("<", "&lt;",).replaceAll(">", "&gt;",);

/** Escape for safe insertion inside a double-quoted attribute value (& < > "). */
export const escAttr = (s: string | null | undefined,): string => escText(s,).replaceAll('"', "&quot;",);

/** Allowlist http(s)/mailto schemes; rewrite everything else to a benign `#blocked`. */
export const safeUrl = (s: string | null | undefined,): string => {
  const u = s ?? "";
  return SAFE_URL.test(u,) ? escAttr(u,) : "#blocked";
};

export const chatMusicEmbed: ChatMusicEmbed = {
  renderMusicEmbed(msg: MusicLinkMessage,): string {
    const DOMPurify = getDOMPurify();

    if (msg.nsfwHidden) {
      return NSFW_PLACEHOLDER;
    }

    if (!msg.embedHtml) {
      // Fallback: render a linked title card with strictly escaped values to
      // prevent stored XSS from LLM/regex-extracted metadata
      // (thumbnailUrl/title/artist/serviceUrl).
      const thumb = msg.thumbnailUrl
        ? `<img src="${safeUrl(msg.thumbnailUrl,)}" alt="${escAttr(msg.title,)}" class="music-embed-thumb" />`
        : "";
      return `<div class="music-embed-card">
        ${thumb}
        <a href="${safeUrl(msg.serviceUrl,)}" target="_blank" rel="noopener" class="music-embed-link">
          ${escText(msg.title,)} — ${escText(msg.artist,)}
        </a>
      </div>`;
    }

    // Fail-closed: without DOMPurify we must not inject raw embed HTML —
    // return a placeholder instead.
    if (!DOMPurify) {
      return '<span class="music-embed-error">Embed unavailable (sanitizer missing)</span>';
    }

    return DOMPurify.sanitize(msg.embedHtml, {
      ALLOWED_TAGS: ["iframe", "span",],
      ALLOWED_ATTR: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "scrolling",],
    },);
  },
};
