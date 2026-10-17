// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import blessed from "blessed";

// @ts-expect-error blessed.helpers is untyped in @types/blessed
const helpers = blessed.helpers as {
  escape(text: string,): string;
};

/**
 * Escape braces in untrusted text for a `tags: true` element.
 *
 * blessed.helpers.escape replaces `{` with `{open}` and `}` with `{close}`,
 * which blessed's tag parser renders as literal braces. This prevents a crafted
 * message or asset field from injecting markup tags into the TUI.
 *
 * @param text - untrusted user-supplied text
 * @returns text safe to interpolate into a `tags: true` blessed element
 */
export function escapeMarkup(text: string,): string {
  return helpers.escape(text,);
}
