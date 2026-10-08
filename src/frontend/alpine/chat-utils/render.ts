// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatState, } from "../types";
import { renderShortcodes, } from "./emoji";

/** */
export type ChatUtilsRender = Partial<ChatState> & ThisType<ChatState>;

const getMarked = () => globalThis.__marked;
const getDOMPurify = () => globalThis.__DOMPurify;

export const chatUtilsRender: ChatUtilsRender = {
  /**
   * @param {string} content
   * @returns {string}
   */
  renderMarkdown(content: string,): string {
    if (!content) { return ""; }
    // Allowlisted `:shortcode:` substitution runs BEFORE markdown so every
    // consumer (chat, group chat, blog comments) shares one render path.
    // Codes inside backtick spans are exempt; unknown codes stay literal.
    const withEmoji = renderShortcodes(content,);
    const marked = getMarked();
    const DOMPurify = getDOMPurify();
    if (!marked || !DOMPurify) {
      // Fail-safe: without the sanitizer we must not inject raw HTML —
      // escape the source text instead of rendering it.
      const div = document.createElement("div",);
      div.textContent = withEmoji;
      return div.getHTML();
    }

    const html = marked.parse(withEmoji,) as string;
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
