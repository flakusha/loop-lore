// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * HTML Sanitization Patterns
 *
 * Compiled regex patterns for stripping dangerous HTML elements
 * and event handlers from generated content, plus content-hash
 * injection patterns for static assets.
 *
 * The sanitizer applies a HYBRID approach:
 * - Allowlist: tags that marked.parse() legitimately produces
 *   (<p>, <a>, <ul>/<ol>/<li>, <strong>, <em>, <code>, <pre>,
 *   <blockquote>, <h1-6>, <hr>, <br>, <img>, <table>/<tr>/<td>/<th>,
 *   <del>, <sup>, <sub>, <input type="checkbox">) are preserved.
 * - Blocklist: all other tags, event handlers (quoted and unquoted),
 *   javascript: URLs, and script tags are stripped.
 * @module regex/html-sanitize
 */

/** Match <script> tags and their contents (including multiline) */
export const SCRIPT_TAG = /<script\b[\s\S]*?<\/script\s*>/gi;

/** Match inline event handlers with double-quoted attributes */
export const ON_EVENT_DOUBLE = /\bon\w+="[^"]*"/gi;

/** Match inline event handlers with single-quoted attributes */
export const ON_EVENT_SINGLE = /\bon\w+='[^']*'/gi;

/** Match unquoted inline event handlers: onerror=alert(1) */
export const ON_EVENT_UNQUOTED = /\bon\w+=[^\s"'>]+/gi;

/** Match javascript: URLs in href or src attributes (both quote styles) */
export const JS_URL_ATTR = /(?:href|src)\s*=\s*["']\s*javascript:[^"']*["']/gi;

/** Match dangerous HTML tags that should be stripped entirely (including their content).
 *  Script tags are handled separately by SCRIPT_TAG. Input tags are produced by
 *  markdown task lists and must NOT be stripped — only their dangerous attributes
 *  (event handlers, javascript: URLs) are removed by the other patterns. */
export const DANGEROUS_TAGS =
  /<(?:iframe|object|embed|style|base|form|button|svg|math)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|style|base|form|button|svg|math)>|<(?:iframe|object|embed|style|base|form|button|svg|math)\b[^>]*\/?>/gi;

/** Content hash injection pattern for <script src="..."> */
export const HASH_INJECTION_SCRIPT = /(<script[^>]*\bsrc\s*=\s*"\/)([^"]+\.(?:js|css))("[^>]*><\/script>)/g;

/** Content hash injection pattern for <link href="..."> */
export const HASH_INJECTION_LINK = /(<link[^>]*\bhref\s*=\s*"\/)([^"]+\.(?:js|css))("[^>]*>)/g;
