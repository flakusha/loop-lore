// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared `log_entries` row envelope.
 *
 * Every audit row the repo writes carries the same envelope: a UUID id, the
 * numeric level, the write time in epoch milliseconds and its ISO form. The
 * message, module, action and entity fields belong to the writer — the
 * envelope belongs here so the shape lives in one place instead of being
 * copied into every audit write.
 */

/** The fields every `log_entries` row carries. */
export interface LogEntryEnvelope {
  /** The row id. */
  id: string;
  /** The numeric log level — 6 is INFO. */
  level: number;
  /** The write time in epoch milliseconds. */
  timestamp: number;
  /** The write time as an ISO string. */
  time: string;
}

/**
 * Build the common envelope of a `log_entries` row.
 * @param level - the numeric log level of the row (6 is INFO)
 * @returns the envelope fields, ready to spread into a row
 */
export function logEntryEnvelope(level: number,): LogEntryEnvelope {
  return {
    id: crypto.randomUUID(),
    level,
    timestamp: Date.now(),
    time: new Date().toISOString(),
  };
}
