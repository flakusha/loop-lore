// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Canonical HTML escaping for frontend string building.
 *
 * Escapes all five characters that can terminate a text node or a quoted
 * attribute value. Do NOT "simplify" this to a `div.textContent` /
 * `div.getHTML()` round-trip: per the HTML fragment serialization algorithm
 * that only encodes `&`, `<` and `>`, so `getHTML()` returns `"` and `'`
 * verbatim and a double quote in the input closes the surrounding attribute.
 * That was a live stored-XSS in the character gallery / edit forms.
 *
 * HTML escaping only — values interpolated into a URL path segment
 * additionally need `encodeURIComponent`.
 *
 * @param str - raw, untrusted string
 * @returns the string with `& < > " '` replaced by entities
 */
export function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",)
    .replaceAll("'", "&#39;",);
}
