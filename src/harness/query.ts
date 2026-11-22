// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec log — read side.
 *
 * Every query reads a bounded window from the END of the JSONL rather than
 * loading the file whole: the log is append-only and grows without bound, and
 * a dashboard endpoint must not turn a long-running process into an OOM.
 *
 * ponytail: when a valid `executions.idx` sidecar exists, the window starts at
 * the record {@link MAX_LINES} from the end instead of {@link READ_WINDOW_BYTES}
 * from the end. Otherwise the capped tail scan below is the fallback. A SQLite
 * mirror remains a non-goal; both paths sit behind these same three exports.
 */
import { type FileHandle, open, readFile, } from "node:fs/promises";
import { parseExecIndex, } from "./exec-index";
import { getExecIndexPath, getExecLogPath, } from "./exec-log";
import { rollupStats, } from "./stats";
import {
  deserializeRun,
  type HarnessRunFilter,
  type HarnessRunRecord,
  type HarnessStats,
} from "./types";

/**
 * Hard ceiling on lines parsed per query. Records are collected from the tail,
 * so this is the newest-N cap, not a scan depth.
 */
export const MAX_LINES = 20_000;

/**
 * Hard ceiling on BYTES read from the end of the log per query. This is the
 * real memory bound — MAX_LINES only caps what survives parsing.
 */
export const READ_WINDOW_BYTES = 4 * 1024 * 1024;

/** Default page size for listRuns. */
export const DEFAULT_LIMIT = 50;

/** Upper bound on a caller-supplied limit, so `?limit=999999` is not an OOM. */
const MAX_LIMIT = 500;
/**
 * Matches a record against every supplied filter field (AND semantics).
 * @param record - the parsed run record to test
 * @param filter - the caller's filters; undefined fields are ignored
 * @returns true when the record satisfies every supplied filter.
 */
function matches(record: HarnessRunRecord, filter: HarnessRunFilter,): boolean {
  if (filter.taskType !== undefined && record.taskType !== filter.taskType) { return false; }
  if (filter.result !== undefined && record.result !== filter.result) { return false; }
  if (filter.task !== undefined && record.task !== filter.task) { return false; }
  if (filter.model !== undefined && record.model !== filter.model) { return false; }
  // Exact match, like every other filter: a turn id is opaque, so a prefix or
  // path query over it would be guesswork that quietly returns a partial turn.
  if (filter.turnId !== undefined && record.turnId !== filter.turnId) { return false; }
  return true;
}

/**
 * Sidecar fast path: start at the record MAX_LINES from the end instead of
 * READ_WINDOW_BYTES from the end. Returns null to signal "fall back to the
 * tail scan" — the sidecar is advisory, never authoritative.
 */
async function readIndexed(handle: FileHandle, size: number,): Promise<HarnessRunRecord[] | null> {
  const idxPath = getExecIndexPath();
  if (idxPath === null) { return null; }
  try {
    const entries = parseExecIndex(await readFile(idxPath,), size,);
    if (entries === null || entries.length === 0) { return null; }
    const from = entries[Math.max(0, entries.length - MAX_LINES,)]!.offset;
    const length = size - from;
    const buf = Buffer.alloc(length,);
    await handle.read(buf, 0, length, from,);
    const out: HarnessRunRecord[] = [];
    for (const line of buf.toString("utf8",).split("\n",)) {
      if (line.trim().length === 0) { continue; }
      const record = deserializeRun(line,);
      if (record !== null) { out.push(record,); }
      if (out.length >= MAX_LINES) { break; }
    }

    out.reverse();
    return out;
  } catch {
    // Unreadable sidecar or range: fall back, never return a guess.
    return null;
  }
}

/**
 * Stream up to {@link MAX_LINES} records from the tail of the log, newest first.
 * @returns Parsed records, newest first. Empty when the log is missing.
 */
async function streamNewestFirst(): Promise<HarnessRunRecord[]> {
  const path = getExecLogPath();
  if (path === null) { return []; }

  let handle: FileHandle;
  try {
    handle = await open(path, "r",);
  } catch {
    return [];
  }

  const out: HarnessRunRecord[] = [];
  try {
    const { size, } = await handle.stat();
    if (size === 0) { return []; }
    const indexed = await readIndexed(handle, size,);
    if (indexed !== null) { return indexed; }

    // ponytail: without a usable sidecar, read at most READ_WINDOW_BYTES + 1
    // from the END of the file, not the whole thing — the log is append-only
    // and unbounded, and a dashboard poll must not turn a long-running process
    // into an OOM. Seeks to the tail (not the head) for the newest runs.
    const start = size > READ_WINDOW_BYTES ? size - READ_WINDOW_BYTES : 0;
    // Start one byte EARLIER so a seek that happens to land on a record
    // boundary includes that newline: the split then yields a leading ""
    // (already skipped below) rather than a complete record we would drop.
    const from = start > 0 ? start - 1 : 0;
    const length = size - from;
    const buf = Buffer.alloc(length,);
    await handle.read(buf, 0, length, from,);

    const lines = buf.toString("utf8",).split("\n",);
    // A mid-line seek lands on a partial record: drop it. On a clean boundary
    // this drops the empty prefix instead, losing nothing.
    if (start > 0) { lines.shift(); }
    for (const line of lines) {
      if (line.trim().length === 0) { continue; }
      const record = deserializeRun(line,);
      if (record !== null) { out.push(record,); }
      if (out.length >= MAX_LINES) { break; }
    }
  } catch {
    // Truncated or unreadable tail: keep whatever parsed.
  } finally {
    // The handle is already read to EOF (or already torn); a close failure here
    // cannot affect the records we parsed, so it is deliberately ignored.
    await handle.close().catch(() => {/* noop */},);
  }

  out.reverse();
  return out;
}

/**
 * List runs, newest first.
 * @param filter - optional taskType / result / task / model filters (AND).
 * @param limit - max rows returned (default 50, hard-capped at 500).
 * @returns Matching runs, newest first.
 */
export async function listRuns(
  filter: HarnessRunFilter = {},
  limit: number = DEFAULT_LIMIT,
): Promise<HarnessRunRecord[]> {
  const capped = Math.max(1, Math.min(Math.trunc(limit,) || DEFAULT_LIMIT, MAX_LIMIT,),);
  const all = await streamNewestFirst();
  const out: HarnessRunRecord[] = [];
  for (const record of all) {
    if (!matches(record, filter,)) { continue; }
    out.push(record,);
    if (out.length >= capped) { break; }
  }

  return out;
}

/**
 * Fetch one run by id.
 * @param runId - the `run_id` from the JSONL.
 * @returns The record, or null when it is not in the scanned window.
 */
export async function getRun(runId: string,): Promise<HarnessRunRecord | null> {
  const all = await streamNewestFirst();
  return all.find((r,) => r.runId === runId) ?? null;
}

/**
 * Roll up the scanned window into totals + per-model / per-task-type / per-pattern
 * counts and tooling-gap counts. Pure math over the same bounded stream as the
 * list endpoint, so the two always agree on what "recent" means.
 * @returns The stats payload; all-zero when the log is missing or empty.
 */
export async function stats(): Promise<HarnessStats> {
  return rollupStats(await streamNewestFirst(),);
}
