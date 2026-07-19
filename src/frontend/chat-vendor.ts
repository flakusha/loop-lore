/**
 * Chat vendor libraries — marked (markdown) + dompurify (XSS sanitization).
 * Separate bundle loaded only when chat page is active.
 * Exposes on globalThis so chat-utils.ts can use without direct imports.
 */
import DOMPurify from "dompurify";

import {
  marked,
} from "marked";

marked.use(
  {
    breaks: true,
    gfm: true,
  },
);

globalThis.__marked = marked;

globalThis.__DOMPurify = DOMPurify;
