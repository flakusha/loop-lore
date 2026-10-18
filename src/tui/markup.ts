// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Escape braces in untrusted text for a `tags: true` element.
 *
 * blessed.helpers.escape replaces `{` with `{open}` and `}` with `{close}`,
 * which blessed's tag parser renders as literal braces. This prevents a crafted
 * message or asset field from injecting markup tags into the TUI.
 *
 * The mapping is inlined here rather than imported from `blessed` on purpose.
 * It is pure string work that needs no terminal, and importing the blessed
 * default export pulls `node-tput` in at module scope - so every test suite
 * that mocks `blessed` with a factory-only double would otherwise load a
 * terminal-backed module just to escape a string.
 *
 * It MUST stay a single pass over the ORIGINAL text (`/[{}]/g`), matching
 * blessed's own implementation exactly. A chained `.replaceAll("{", "{open}")`
 * followed by a `}` pass re-escapes the `{` in the `{open}` it just emitted,
 * producing `{open{close}` - blessed does not do that, and the display tests
 * pin the single-pass output.
 *
 * @param text - untrusted user-supplied text
 * @returns text safe to interpolate into a `tags: true` blessed element
 */
export function escapeMarkup(text: string,): string {
  return text.replace(/[{}]/g, (ch,) => (ch === "{" ? "{open}" : "{close}"),);
}
