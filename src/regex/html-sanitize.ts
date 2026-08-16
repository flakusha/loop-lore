// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * HTML Sanitization Patterns
 *
 * Compiled regex patterns for stripping dangerous HTML elements
 * and event handlers from generated content, plus content-hash
 * injection patterns for static assets.
 *
 * @module regex/html-sanitize
 */

/** Match <script> tags and their contents (including multiline) */
export const SCRIPT_TAG = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;

/** Match inline event handlers with double-quoted attributes */
export const ON_EVENT_DOUBLE = /\bon\w+="[^"]*"/gi;

/** Match inline event handlers with single-quoted attributes */
export const ON_EVENT_SINGLE = /\bon\w+='[^']*'/gi;

/** Content hash injection pattern for <script src="..."> */
export const HASH_INJECTION_SCRIPT = /(<script[^>]*\bsrc\s*=\s*"\/)([^"]+\.(?:js|css))("[^>]*><\/script>)/g;

/** Content hash injection pattern for <link href="..."> */
export const HASH_INJECTION_LINK = /(<link[^>]*\bhref\s*=\s*"\/)([^"]+\.(?:js|css))("[^>]*>)/g;
