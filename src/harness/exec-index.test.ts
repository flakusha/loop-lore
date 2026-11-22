// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Offset-sidecar tests: the >4 MB fast path behind all three query exports,
 * fallback on torn/drifted indexes, and writer/reader entry alignment.
 * Every test owns a unique temp dir and removes it in `finally`.
 */
import { describe, expect, it, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import {
  EXEC_INDEX_ENTRY_BYTES,
  EXEC_INDEX_FILENAME,
  formatIndexEntry,
  parseExecIndex,
} from "./exec-index";
import { appendExecLog, getExecIndexPath, resetExecLogPath, setExecLogPath, } from "./exec-log";
import { getRun, listRuns, MAX_LINES, READ_WINDOW_BYTES, stats, } from "./query";
import { deserializeRun, type HarnessRunRecord, serializeRun, } from "./types";

const TMP_ROOT = ".tmp/harness-offset-index";

/** A record with every field defaulted; tests override only what matters. */
function rec(overrides: Partial<HarnessRunRecord>,): HarnessRunRecord {
  return {
    runId: "r0",
    ts: "2026-10-03T00:00:00Z",
    runMs: 100,
    task: "t",
    taskType: "chat",
    model: "m",
    tools: [],
    toolCount: 0,
    pattern: "",
    patternDetail: "",
    result: "ok",
    error: null,
    toolingGap: null,
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    branch: null,
    pid: null,
    gitSha: null,
    msg: null,
    turnId: null,
    ...overrides,
  };
}

/** One serialized JSONL line for a record, with its trailing newline. */
function line(record: HarnessRunRecord,): string {
  return JSON.stringify(serializeRun(record,),) + "\n";
}

/** A fresh, unique fixture dir; TMP_ROOT is stable but dirs never collide. */
function freshDir(prefix: string,): string {
  mkdirSync(TMP_ROOT, { recursive: true, },);
  return mkdtempSync(join(TMP_ROOT, prefix,),);
}

/** Remove a fixture dir and the forced path seam. */
function cleanup(dir: string,): void {
  resetExecLogPath();
  rmSync(dir, { recursive: true, force: true, },);
}

/** Append a log line and its matching fixed-width sidecar entry. */
function emit(
  parts: string[],
  entries: string[],
  record: HarnessRunRecord,
  cursor: { value: number },
): void {
  const text = line(record,);
  const bytes = Buffer.byteLength(text, "utf8",);
  parts.push(text,);
  entries.push(formatIndexEntry(cursor.value, bytes,),);
  cursor.value += bytes;
}

describe("executions.jsonl offset sidecar", () => {
  it("queries a >4 MB log past the old tail cap through all three exports", async () => {
    const dir = freshDir("large-",);
    try {
      const needle = rec({
        runId: "needle",
        model: "needle-model",
        turnId: "needle-turn",
        result: "error",
        costUsd: 1.25,
      },);

      const parts: string[] = [];
      const entries: string[] = [];
      const cursor = { value: 0, };
      emit(parts, entries, needle, cursor,);
      // ~650 B/record clears 4 MB in ~7200 records, still under MAX_LINES so
      // the needle is in the indexed scan's range (not just past the byte cap).
      const filler = Math.ceil((READ_WINDOW_BYTES * 1.1) / 650,);
      for (let i = 0; i < filler; i++) {
        emit(parts, entries, rec({ runId: `f${i}`, model: "filler", msg: "x".repeat(600,), },), cursor,);
      }

      expect(parts.join("",).length,).toBeGreaterThan(READ_WINDOW_BYTES,);
      expect(filler + 1,).toBeLessThan(MAX_LINES,);
      const logPath = join(dir, "executions.jsonl",);
      writeFileSync(logPath, parts.join("",), "utf8",);
      writeFileSync(join(dir, EXEC_INDEX_FILENAME,), entries.join("",), "ascii",);
      setExecLogPath(logPath,);

      // getRun: the needle predates the old 4 MB window.
      expect((await getRun("needle",))?.runId,).toBe("needle",);
      // listRuns: filter to the needle only.
      expect((await listRuns({ turnId: "needle-turn", }, 50,)).map((r,) => r.runId),).toEqual(["needle",],);
      // stats: the needle's unique model and failure reach the rollup.
      const summary = await stats();
      expect(summary.byModel.find((m,) => m.model === "needle-model")?.runs,).toBe(1,);
      expect(summary.totals.failures,).toBe(1,);
    } finally {
      cleanup(dir,);
    }
  });

  it("falls back to the tail scan when the sidecar is truncated", async () => {
    const dir = freshDir("truncated-",);
    try {
      const records = [0, 1, 2, 3, 4,].map((n,) => rec({ runId: `r${n}`, },));
      const parts: string[] = [];
      const entries: string[] = [];
      const cursor = { value: 0, };
      for (const record of records) { emit(parts, entries, record, cursor,); }
      const logPath = join(dir, "executions.jsonl",);
      writeFileSync(logPath, parts.join("",), "utf8",);
      const full = entries.join("",);
      // A torn last write leaves a partial entry: length is no longer a
      // multiple of the fixed width, so parseExecIndex rejects the whole file.
      expect(full.length % EXEC_INDEX_ENTRY_BYTES,).toBe(0,);
      writeFileSync(join(dir, EXEC_INDEX_FILENAME,), full.slice(0, full.length - 3,), "ascii",);
      setExecLogPath(logPath,);

      expect((await listRuns({}, 50,)).map((r,) => r.runId),).toEqual(["r4", "r3", "r2", "r1", "r0",],);
    } finally {
      cleanup(dir,);
    }
  });

  it("falls back when the log grows after the sidecar was written", async () => {
    const dir = freshDir("drift-",);
    try {
      const records = [0, 1, 2, 3, 4,].map((n,) => rec({ runId: `r${n}`, },));
      const parts: string[] = [];
      const entries: string[] = [];
      const cursor = { value: 0, };
      for (const record of records) { emit(parts, entries, record, cursor,); }
      const logPath = join(dir, "executions.jsonl",);
      writeFileSync(logPath, parts.join("",), "utf8",);
      writeFileSync(join(dir, EXEC_INDEX_FILENAME,), entries.join("",), "ascii",);
      // Append a line without a matching entry: index no longer covers EOF.
      const extra = line(rec({ runId: "r5", },),);
      writeFileSync(logPath, parts.join("",) + extra, "utf8",);
      setExecLogPath(logPath,);

      expect((await listRuns({}, 50,)).map((r,) => r.runId),).toEqual(["r5", "r4", "r3", "r2", "r1", "r0",],);
      expect((await getRun("r5",))?.runId,).toBe("r5",);
    } finally {
      cleanup(dir,);
    }
  });

  it("keeps sidecar entries aligned across multiple appends", () => {
    const dir = freshDir("append-",);
    try {
      const logPath = join(dir, "executions.jsonl",);
      setExecLogPath(logPath,);
      const written: string[] = [];
      for (let i = 0; i < 6; i++) {
        const runId = `a${i}`;
        appendExecLog(rec({ runId, msg: i % 2 === 0 ? "y".repeat(80,) : null, },),);
        written.push(runId,);
        const idxPath = getExecIndexPath();
        expect(idxPath,).not.toBeNull();
        const entries = parseExecIndex(readFileSync(idxPath!,), statSync(logPath,).size,);
        expect(entries,).not.toBeNull();
        expect(entries!,).toHaveLength(i + 1,);
        const logBytes = readFileSync(logPath,);
        entries!.forEach((entry, n,) => {
          const text = logBytes.subarray(entry.offset, entry.offset + entry.length,).toString("utf8",);
          expect(deserializeRun(text,)?.runId,).toBe(written[n],);
        },);
      }
    } finally {
      cleanup(dir,);
    }
  });
});
