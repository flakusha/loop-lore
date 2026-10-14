// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Table renderer for the `logs:query` CLI's `--format table` output.
 *
 * Split out of log-query.ts for the per-file size gate. Takes the row shape
 * it renders structurally, so it carries no DB/Kysely dependency.
 */

/** The subset of a `log_entries` row the table renders. */
export interface LogTableRow {
  created_at?: string | number | null;
  level: string | number | null;
  event_type?: string | number | null;
  entity_type?: string | number | null;
  entity_id?: string | number | null;
  user_id?: string | number | null;
  message: string | number | null;
}

/**
 * Render rows as a fixed-width table for humans.
 * @param entries
 * @returns the header row and one padded line per entry, joined by newlines
 */
export function formatTable(entries: LogTableRow[],): string {
  const header = ["CREATED_AT", "LEVEL", "EVENT", "ENTITY", "USER", "MESSAGE",];
  const rows: string[][] = entries.map((entry,) => [
    String(entry.created_at ?? "-",),
    String(entry.level,),
    String(entry.event_type ?? "-",),
    entry.entity_id === null
      ? String(entry.entity_type ?? "-",)
      : `${entry.entity_type}:${entry.entity_id}`,
    String(entry.user_id ?? "-",),
    String(entry.message,).slice(0, 60,),
  ]);

  const widths = header.map((cell, i,) => Math.max(cell.length, ...rows.map((row,) => row[i]!.length),));

  const line = (cells: string[],): string => cells.map((cell, i,) => cell.padEnd(widths[i]!,)).join("  ",).trimEnd();

  return [line(header,), ...rows.map(line,),].join("\n",);
}
