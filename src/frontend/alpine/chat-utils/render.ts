// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatState, } from "../types";

export type ChatUtilsRender = Partial<ChatState> & ThisType<ChatState>;

const getMarked = () => globalThis.__marked;
const getDOMPurify = () => globalThis.__DOMPurify;

export const chatUtilsRender: ChatUtilsRender = {
  renderMarkdown(content: string,): string {
    if (!content) { return ""; }
    const marked = getMarked();
    const DOMPurify = getDOMPurify();
    if (!marked || !DOMPurify) {
      // Fail-safe: without the sanitizer we must not inject raw HTML —
      // escape the source text instead of rendering it.
      const div = document.createElement("div",);
      div.textContent = content;
      return div.getHTML();
    }
    const html = marked.parse(content,) as string;
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

  escapeHtml(str: string,) {
    const div = document.createElement("div",);
    div.textContent = str;
    return div.getHTML();
  },
};
