// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared DOMPurify allowlist for server-rendered HTML that lands in innerHTML.
 * One source of truth so every render path strips the same dangerous tags
 * (script, iframe, event handlers) instead of relying on per-call defaults.
 */
export const SANITIZE_CONFIG = {
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
} as const;
