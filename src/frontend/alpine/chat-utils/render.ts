// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatState, } from "../types";
import { renderShortcodes, } from "./emoji";

/** */
export type ChatUtilsRender = Partial<ChatState> & ThisType<ChatState>;

const getMarked = () => globalThis.__marked;
const getDOMPurify = () => globalThis.__DOMPurify;

/** Allowlisted `:shortcode:` to emoji map shared by chat + group chat (both render through `renderMarkdown`). Unknown codes stay literal. */
export const EMOJI_SHORTCODES: Record<string, string> = {
  thumbsup: "👍",
  "+1": "👍",
  heart: "❤️",
  laugh: "😂",
  joy: "😂",
  mask: "🎭",
  swords: "⚔️",
  dagger: "🗡️",
  castle: "🏰",
  sparkles: "✨",
  skull: "💀",
  dragon: "🐉",
  tree: "🌲",
  zap: "⚡",
  fire: "🔥",
  droplet: "💧",
  moon: "🌙",
};
const SHORTCODE_RE = /:([a-z0-9_+\-]+):/gi;
const CODE_SPAN_RE = /(```[\s\S]*?```|`[^`]*`)/g;

/** Expand allowlisted `:shortcode:` to emoji; code spans untouched. Replacement values are emoji text (never HTML), safe pre-markdown. */
export function expandEmojiShortcodes(text: string,): string {
  if (!text || !text.includes(":",)) { return text; }
  return text.split(CODE_SPAN_RE,).map((part, index,) => {
    if (index % 2 === 1) { return part; }
    return part.replace(SHORTCODE_RE, (match, name: string,) => EMOJI_SHORTCODES[name.toLowerCase()] ?? match,);
  },).join("",);
}

/** All known shortcodes for picker/autocomplete. */
export function listEmojiShortcodes(): { name: string; emoji: string }[] {
  return Object.entries(EMOJI_SHORTCODES,).map(([name, emoji,],) => ({ name, emoji, }));
}
export const chatUtilsRender: ChatUtilsRender = {
  /**
   * @param {string} content
   * @returns {string}
   */
  renderMarkdown(content: string,): string {
    if (!content) { return ""; }
    // Shared `:shortcode:` expansion for chat + group chat (same map, same
    // allowlist). Allowlisted emoji text only — safe before marked/sanitize.
    const expanded = expandEmojiShortcodes(content,);
    const marked = getMarked();
    const DOMPurify = getDOMPurify();
    if (!marked || !DOMPurify) {
      // Fail-safe: without the sanitizer we must not inject raw HTML —
      // escape the source text instead of rendering it.
      const div = document.createElement("div",);
      div.textContent = expanded;
      return div.getHTML();
    }

    const html = marked.parse(expanded,) as string;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "b",
        "i",
        "em",
        "strong",
        "a",
        "p",
        "br",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "code",
        "pre",
        "blockquote",
        "table",
        "thead",
        "td",
        "th",
        "tr",
        "hr",
        "img",
        "del",
        "ins",
        "sup",
        "sub",
        "details",
        "summary",
        "div",
        "span",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel",],
    },);
  },

  /**
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str: string,) {
    const div = document.createElement("div",);
    div.textContent = str;
    return div.getHTML();
  },
};
