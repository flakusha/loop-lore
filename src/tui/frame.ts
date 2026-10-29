// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Box-drawing frame helpers — the pi-tui replacement for `blessed.box`
 * `border: { type: "line" }` + `label`.
 */

import { tagsToAnsi, } from "./ansi";
import { padding, truncateToWidth, visibleWidth, } from "./pi";

/** ANSI colors used by the frames (the old blessed border fg values). */
export type FrameColor = "cyan" | "yellow" | "magenta";

const COLOR_CODES: Record<FrameColor, string> = {
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
};

/**
 * Render `content` inside a titled single-line border.
 *
 * Content rows are truncated/padded to the inner width; short content is
 * padded with blanks so the right border lines up.
 * @param options - title, rows, width, border color
 * @returns border + content + border rows
 */
export function renderFramed(options: {
  title: string;
  rows: readonly string[];
  width: number;
  color?: FrameColor;
},): string[] {
  const { title, width, color = "cyan", } = options;
  const inner = Math.max(0, width - 2,);
  const colorCode = COLOR_CODES[color]!;
  const reset = "\x1b[39m";

  const label = ` ${title} `;
  const labelCut = truncateToWidth(label, Math.max(0, inner,),);
  const topPad = Math.max(0, inner - visibleWidth(labelCut,),);
  const top = `${colorCode}┌${reset}${labelCut}${padding(topPad,)}${colorCode}┐${reset}`;
  const bottom = `${colorCode}└${"─".repeat(inner,)}┘${reset}`;

  const body = options.rows.map((raw,) => {
    const line = tagsToAnsi(raw,);
    const cut = truncateToWidth(line, inner,);
    const pad = Math.max(0, inner - visibleWidth(cut,),);
    return `${colorCode}│${reset}${cut}${padding(pad,)}${colorCode}│${reset}`;
  },);

  return [top, ...body, bottom,];
}
