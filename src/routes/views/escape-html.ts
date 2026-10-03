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
