// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { escapeMarkup, } from "../markup";

/**
 * Replace (or remove) the single live-generation row in a transcript.
 * @param row - current row index, or null when no stream row exists
 * @param lines - transcript rows, mutated in place
 * @param content - latest snapshot, or null to remove the row
 * @returns the row index to keep for the next update, or null
 */
export function applyStreamRow(
  row: number | null,
  lines: string[],
  content: string | null,
): number | null {
  if (content === null) {
    if (row === null) { return null; }
    lines.splice(row, 1,);
    return null;
  }

  const line = `{cyan-fg}${escapeMarkup(content,)}{/cyan-fg}`;
  if (row === null) {
    lines.push(line,);
    return lines.length - 1;
  }

  lines[row] = line;
  return row;
}
