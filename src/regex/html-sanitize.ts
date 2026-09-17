// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * HTML Sanitization Patterns (public barrel).
 *
 * The sanitizer applies a HYBRID approach:
 * - Allowlist: tags that marked.parse() legitimately produces
 *   (<p>, <a>, <ul>/<ol>/<li>, <strong>, <em>, <code>, <pre>,
 *   <blockquote>, <h1-6>, <hr>, <br>, <img>, <table>/<tr>/<td>/<th>,
 *   <del>, <sup>, <sub>, <input type="checkbox">) are preserved.
 * - Blocklist: all other tags, event handlers (quoted and unquoted),
 *   javascript: URLs, and script tags are stripped.
 *
 * The patterns + `sanitizeHtml` body live in `./html-sanitize-core`
 * (leaf module). They are re-exported from this file so existing
 * import paths continue to resolve.
 * @module regex/html-sanitize
 */

export {
  DANGEROUS_TAGS,
  JS_URL_ATTR,
  ON_EVENT_DOUBLE,
  ON_EVENT_SINGLE,
  ON_EVENT_UNQUOTED,
  sanitizeHtml,
  stripScriptTags,
} from "./html-sanitize-core";
export { createStreamingSanitizer, } from "./html-sanitize-streaming";

/** Content hash injection pattern for <script src="..."> */
export const HASH_INJECTION_SCRIPT = /(<script[^>]*\bsrc\s*=\s*"\/)([^"]+\.(?:js|css))("[^>]*><\/script>)/g;

/** Content hash injection pattern for <link href="..."> */
export const HASH_INJECTION_LINK = /(<link[^>]*\bhref\s*=\s*"\/)([^"]+\.(?:js|css))("[^>]*>)/g;
