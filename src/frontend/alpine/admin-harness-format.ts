// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cell formatters shared by the Harness tab's list rows and its detail view.
 *
 * Split out of `admin-harness-rows.ts` so both view builders format a value
 * the same way; the empty-value dash, the duration unit and the cent-precision
 * cost must not be able to disagree between the two tables.
 */
import { formatDisplayDate, } from "./chat-utils/time";

/**
 * Render an optional wire value for a text cell.
 *
 * A dash, matching the TUI detail panel, not an empty string: these rows are
 * searched by `filteredHarnessRuns()`, where `${row.branch}` on a null would
 * stringify to the literal text `null` and match every branchless run.
 * @param value - The wire value, which may be null or absent
 * @returns The value, or the dash placeholder when there is nothing to show
 */
export function textOrDash(value: string | number | null | undefined,): string {
  return value === null || value === undefined || value === "" ? "\u2014" : String(value,);
}

/**
 * Format a millisecond span for a stat card or table cell.
 * @param ms - Duration in milliseconds
 * @returns Compact human string, e.g. `340ms` / `1.2s` / `4m`
 */
export function formatDuration(ms: number,): string {
  if (!Number.isFinite(ms,)) { return "-"; }
  if (ms < 1000) { return `${Math.round(ms,)}ms`; }
  if (ms < 60_000) { return `${(ms / 1000).toFixed(1,)}s`; }
  return `${Math.round(ms / 60_000,)}m`;
}

/**
 * Format a USD amount at cent precision. Sub-cent spend still reads `$0.00`
 * rather than an empty cell.
 * @param usd - Amount in US dollars
 * @returns `$`-prefixed amount with two decimals
 */
export function formatUsd(usd: number,): string {
  if (!Number.isFinite(usd,)) { return "$0.00"; }
  return `$${usd.toFixed(2,)}`;
}

/**
 * Render a wire timestamp for display, falling back to the raw value when the
 * formatter cannot parse it — a malformed ts must not blank the cell.
 * @param ts - ISO timestamp from the wire
 * @returns Localized date-time, or the raw string
 */
export function formatRunTs(ts: string,): string {
  return formatDisplayDate(ts, "datetime",) || ts;
}
