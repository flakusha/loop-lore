// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * blessed-tag → ANSI SGR conversion.
 *
 * The display formatters (`chat/display.ts`, `harness/display.ts`,
 * `models-display.ts`) emit blessed-style tags (`{bold}…{/bold}`, `{red-fg}`)
 * and stayed untouched by the pi-tui migration; pi-tui has no tag parser, so
 * this module converts their output to inline ANSI at the render boundary.
 * `{open}`/`{close}` (the output of `escapeMarkup`) become literal braces, so
 * escaped untrusted text renders as the user typed it.
 */

/** SGR opener per supported tag name. */
const OPENERS: Record<string, string> = {
  bold: "\x1b[1m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  "red-fg": "\x1b[31m",
  red: "\x1b[31m",
  "green-fg": "\x1b[32m",
  green: "\x1b[32m",
  "yellow-fg": "\x1b[33m",
  yellow: "\x1b[33m",
  "blue-fg": "\x1b[34m",
  blue: "\x1b[34m",
  "magenta-fg": "\x1b[35m",
  magenta: "\x1b[35m",
  "cyan-fg": "\x1b[36m",
  cyan: "\x1b[36m",
  "white-fg": "\x1b[37m",
  white: "\x1b[37m",
  "gray-fg": "\x1b[90m",
  gray: "\x1b[90m",
  // blessed's bold-with-color-3 compound tag (used by the chat picker's
  // pinned marker): bold + yellow foreground.
  "bold-fg3": "\x1b[1m\x1b[33m",
};

/** SGR closer per tag name; colors reset only the foreground. */
const CLOSERS: Record<string, string> = {
  bold: "\x1b[22m",
  italic: "\x1b[23m",
  underline: "\x1b[24m",
  "bold-fg3": "\x1b[22m\x1b[39m",
};

const COLOR_CLOSE = "\x1b[39m";

/**
 * Convert blessed-style tag markup to ANSI escape sequences.
 *
 * Unknown tags are stripped (blessed rendered them as nothing when parsed;
 * stripping keeps width accounting honest). `{open}`/`{close}` map to literal
 * braces so `escapeMarkup`-escaped text survives the round trip.
 * @param text - tagged line from a display formatter
 * @returns ANSI-styled line safe to feed a pi-tui component
 */
export function tagsToAnsi(text: string,): string {
  return text.replace(/\{(\/?)([a-z0-9-]+)\}/gi, (whole, slash: string, name: string,): string => {
    if (name === "open") { return slash ? whole : "{"; }
    if (name === "close") { return slash ? whole : "}"; }
    if (slash) {
      return CLOSERS[name] ?? (OPENERS[name] !== undefined ? COLOR_CLOSE : "");
    }

    return OPENERS[name] ?? "";
  },);
}
