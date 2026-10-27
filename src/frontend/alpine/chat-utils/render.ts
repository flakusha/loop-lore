// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { escapeHtml, } from "../../html-escape";
import type { ChatState, } from "../types";
import { renderShortcodes, } from "./emoji";
import { SANITIZE_CONFIG, } from "./sanitize";

/** */
export type ChatUtilsRender = Partial<ChatState> & ThisType<ChatState>;

/** Minimal surface of the app-wide `marked` bundle. */
interface MarkedLike {
  parse(markdown: string,): string | Promise<string>;
}

/** Minimal surface of the app-wide `DOMPurify` bundle. */
interface PurifyLike {
  sanitize(html: string, config?: unknown,): string;
}

/**
 * App-wide bundles installed by `src/frontend/chat-vendor.ts`. Typed locally
 * so the file also typechecks under the backend/scripts projects, which do not
 * include the frontend's global declarations.
 */
const appGlobals = globalThis as unknown as {
  __marked?: MarkedLike;
  __DOMPurify?: PurifyLike;
};

const getMarked = () => appGlobals.__marked;
const getDOMPurify = () => appGlobals.__DOMPurify;

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
    return DOMPurify.sanitize(html, SANITIZE_CONFIG,);
  },

  // Escapes `& < > " '` — safe in text nodes and quoted attributes.
  escapeHtml,
};
