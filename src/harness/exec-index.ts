// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fixed-width offset sidecar for the harness exec log.
 *
 * One 33-byte entry per JSONL line: a 16-digit byte offset, a 16-digit byte
 * length (the line plus its trailing newline), and "\n". `appendExecLog`
 * appends an entry in lockstep with each log line, so entry N describes line
 * N. The read side uses the offsets to seek past the old 4 MB tail window; a
 * torn or drifted sidecar is rejected so the reader falls back to its tail
 * scan rather than returning a wrong subset.
 */

/** Sidecar filename, written next to `executions.jsonl`. */
export const EXEC_INDEX_FILENAME = "executions.idx";

/** Bytes per sidecar entry: 16 offset digits + 16 length digits + newline. */
export const EXEC_INDEX_ENTRY_BYTES = 33;

/** One parsed sidecar entry. */
export interface ExecIndexEntry {
  /** Byte offset of the log line in `executions.jsonl`. */
  offset: number;
  /** Byte length of that line, including its trailing newline. */
  length: number;
}

const DIGITS_16 = /^\d{16}$/;

/**
 * Format one sidecar entry.
 * @param offset - byte offset of the log line
 * @param length - byte length of the line including its trailing newline
 * @returns a fixed-width entry ending in "\n"
 */
export function formatIndexEntry(offset: number, length: number,): string {
  return `${offset.toString().padStart(16, "0",)}${length.toString().padStart(16, "0",)}\n`;
}

/**
 * Parse and validate a whole sidecar against the log's current size.
 *
 * Rejects partial writes (size not a multiple of the entry width), malformed
 * fields, gaps/overlaps between entries, and drift (the index does not cover
 * the whole log). Any rejection means "fall back to the tail scan", never
 * "return a plausible but wrong subset".
 *
 * @param buf - raw sidecar bytes
 * @param logSize - current byte size of `executions.jsonl`
 * @returns entries in log order, or null when the sidecar cannot be trusted
 */
export function parseExecIndex(buf: Buffer, logSize: number,): ExecIndexEntry[] | null {
  if (buf.length === 0 || buf.length % EXEC_INDEX_ENTRY_BYTES !== 0) { return null; }
  const count = buf.length / EXEC_INDEX_ENTRY_BYTES;
  const entries: ExecIndexEntry[] = [];
  let expectedOffset = 0;
  for (let i = 0; i < count; i++) {
    const base = i * EXEC_INDEX_ENTRY_BYTES;
    if (buf[base + 32] !== 0x0A) { return null; }
    const offsetField = buf.toString("ascii", base, base + 16,);
    const lengthField = buf.toString("ascii", base + 16, base + 32,);
    if (!DIGITS_16.test(offsetField,) || !DIGITS_16.test(lengthField,)) { return null; }
    const offset = Number(offsetField,);
    const length = Number(lengthField,);
    if (!Number.isSafeInteger(offset,) || !Number.isSafeInteger(length,) || length <= 0) { return null; }
    // First entry must start at 0 and every entry must be contiguous: this
    // rejects a sidecar begun mid-log (legacy file) as well as torn writes.
    if (offset !== expectedOffset) { return null; }
    expectedOffset = offset + length;
    entries.push({ offset, length, },);
  }

  if (expectedOffset !== logSize) { return null; }
  return entries;
}
