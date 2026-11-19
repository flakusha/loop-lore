// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Minimal HTML escaping for server-rendered markup.
 *
 * Lives in its own leaf module (rather than `layout.ts`) so modules that
 * `layout` renders can escape without importing `layout` back — avoids a
 * `layout <-> consumer` import cycle.
 *
 * @param str - raw text to escape
 * @returns text with `&`, `<`, `>`, and `"` replaced by HTML entities.
 */
export function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}

/**
 * Escape a JSON string for interpolation into an inline `<script>` block.
 *
 * `JSON.stringify` escapes quotes and backslashes but leaves `<`, `>` and `&`
 * literal, so a value containing `</script>` closes the element and everything
 * after it becomes markup. HTML entities are NOT usable here: script content is
 * raw text, never entity-decoded, so `&lt;` would survive into `JSON.parse` and
 * corrupt the value. JSON `\\uXXXX` escapes round-trip exactly.
 *
 * `<`, `>` and `&` can only ever occur inside JSON string values, so a global
 * replace cannot damage the surrounding syntax. U+2028/U+2029 are valid JSON
 * but illegal raw in a JS string literal.
 * @param json - output of `JSON.stringify`
 * @returns the same document, safe to place inside a `<script>` element
 */
export function escapeJsonForScript(json: string,): string {
  return json
    .replaceAll("<", "\\u003c",)
    .replaceAll(">", "\\u003e",)
    .replaceAll("&", "\\u0026",)
    .replaceAll("\u2028", "\\u2028",)
    .replaceAll("\u2029", "\\u2029",);
}

/**
 * Escape a value that is interpolated into a quoted HTML attribute and also
 * read back as a JS single-quoted string body (Alpine `x-data="fn('{{id}}')"`).
 *
 * HTML entities are decoded before the JS expression runs, so entity-only
 * escaping is not enough: `&#39;` becomes a real quote inside the JS string.
 * Backslash escapes survive HTML parsing and round-trip in both contexts.
 *
 * @param value - raw untrusted value
 * @returns text safe in `attr="...'VALUE'..."` and plain `attr="VALUE"`
 */
export function escapeHtmlAndJsString(value: string,): string {
  return value
    .replaceAll("\\", "\\\\",)
    .replaceAll("'", "\\u0027",)
    .replaceAll("\n", "\\n",)
    .replaceAll("\r", "\\r",)
    .replaceAll("\u2028", "\\u2028",)
    .replaceAll("\u2029", "\\u2029",)
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}
