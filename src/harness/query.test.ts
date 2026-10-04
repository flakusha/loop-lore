// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Read-side tests against a REAL jsonl file on disk. The route tests stub this
 * module, which is exactly why the unbounded-read bug shipped; these exercise
 * the actual open/seek/parse/rollup path, including the memory bound.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { setExecLogPath, } from "./exec-log";
import { getRun, listRuns, MAX_LINES, READ_WINDOW_BYTES, stats, } from "./query";
import { type HarnessRunRecord, serializeRun, toSummary, } from "./types";

const NL = "\n";

/**
 * Fixtures live under the repo's `.tmp/`, never `os.tmpdir()`: these tests must
 * exercise the reader against a real path inside the project, and a stray
 * system-temp file can never be inspected when a test fails.
 */
const TMP_ROOT = ".tmp/harness-query";

/** A record with every field defaulted, so tests override only what matters. */
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
    ...overrides,
  };
}

/** One serialized JSONL line for a record, with its trailing newline. */
function line(record: HarnessRunRecord,): string {
  return JSON.stringify(serializeRun(record,),) + NL;
}

/** N synthetic records, each padded to `pad` bytes of `msg`. */
function bulk(prefix: string, count: number, pad: number,): string {
  return Array.from({ length: count, }, (_, i,) => line(rec({ runId: prefix + i, msg: "x".repeat(pad,), },),),).join(
    "",
  );
}

describe("harness query (file-backed)", () => {
  let dir: string;
  let log: string;

  beforeEach(() => {
    mkdirSync(TMP_ROOT, { recursive: true, },);
    dir = mkdtempSync(join(TMP_ROOT, "fixture-",),);
    log = join(dir, "executions.jsonl",);
  },);

  afterEach(() => {
    setExecLogPath(null,);
    rmSync(dir, { recursive: true, force: true, },);
  },);

  /** Write records oldest-first, as the append-only writer does. */
  function write(records: HarnessRunRecord[],): void {
    writeFileSync(log, records.map(line,).join("",),);
    setExecLogPath(log,);
  }

  it("returns newest-first, not file order", async () => {
    write([rec({ runId: "oldest", },), rec({ runId: "middle", },), rec({ runId: "newest", },),],);
    expect((await listRuns({}, 10,)).map((r,) => r.runId),).toEqual(["newest", "middle", "oldest",],);
  });

  it("honours the limit", async () => {
    write([1, 2, 3, 4, 5,].map((n,) => rec({ runId: "r" + n, },)),);
    expect((await listRuns({}, 2,)).map((r,) => r.runId),).toEqual(["r5", "r4",],);
  });

  it("clamps a hostile or zero limit instead of allocating for it", async () => {
    write([rec({ runId: "only", },),],);
    expect((await listRuns({}, 999_999,)).length,).toBe(1,);
    expect((await listRuns({}, 0,)).length,).toBe(1,);
  });

  it("filters by taskType and by result, ANDing when both are given", async () => {
    write([
      rec({ runId: "a", taskType: "chat", result: "ok", },),
      rec({ runId: "b", taskType: "chat", result: "error", },),
      rec({ runId: "c", taskType: "aux", result: "error", },),
    ],);
    // Results are newest-first, so file order a,b,c comes back b,a / c,b.
    expect((await listRuns({ taskType: "chat", }, 10,)).map((r,) => r.runId),).toEqual(["b", "a",],);
    expect((await listRuns({ result: "error", }, 10,)).map((r,) => r.runId),).toEqual(["c", "b",],);
    expect((await listRuns({ taskType: "chat", result: "error", }, 10,)).map((r,) => r.runId),).toEqual(["b",],);
  });

  it("fetches one run by id and returns null for a miss", async () => {
    write([rec({ runId: "target", tools: ["read",], toolCount: 1, },),],);
    expect((await getRun("target",))?.tools,).toEqual(["read",],);
    expect(await getRun("nope",),).toBeNull();
  });

  it("skips blank and unparseable lines without losing the rest", async () => {
    const good = line(rec({ runId: "good", },),);
    writeFileSync(log, good + NL + "{ truncated json" + NL + good,);
    setExecLogPath(log,);
    expect((await listRuns({}, 10,)).map((r,) => r.runId),).toEqual(["good", "good",],);
  });

  it("returns empty for a missing file, an empty file, and a null path", async () => {
    setExecLogPath(join(dir, "does-not-exist.jsonl",),);
    expect(await listRuns({}, 10,),).toEqual([],);
    writeFileSync(log, "",);
    setExecLogPath(log,);
    expect(await listRuns({}, 10,),).toEqual([],);
    setExecLogPath(null,);
    expect(await listRuns({}, 10,),).toEqual([],);
  });

  it("reads a bounded window from the tail, never the whole file", async () => {
    const body = bulk("old-", 4000, 2000,) + line(rec({ runId: "newest", },),);
    expect(body.length,).toBeGreaterThan(READ_WINDOW_BYTES,);
    writeFileSync(log, body,);
    setExecLogPath(log,);

    const runs = await listRuns({}, 10,);
    expect(runs[0]?.runId,).toBe("newest",);
    // Bounded: strictly fewer than the 4001 records on disk, and nowhere near
    // MAX_LINES. The unbounded-read regression would have parsed all 4001.
    expect(runs.length,).toBeLessThan(4000,);
    expect(runs.length,).toBeLessThanOrEqual(MAX_LINES,);
    // The tail of the file survives; its head is dropped.
    expect(runs.some((r,) => r.runId === "old-0"),).toBe(false,);
  });

  it("does not emit a partial record when the window starts mid-line", async () => {
    const body = bulk("o", 3000, 2000,) + line(rec({ runId: "tail", },),);
    writeFileSync(log, body,);
    setExecLogPath(log,);
    const runs = await listRuns({}, 10,);
    expect(runs[0]?.runId,).toBe("tail",);
    // A torn first line fails to parse and is dropped, so every surviving
    // record is whole — no record can carry a corrupted field.
    for (const r of runs) {
      expect(r.ts,).toBe("2026-10-03T00:00:00Z",);
      expect(r.taskType,).toBe("chat",);
    }
  });

  describe("stats rollup math", () => {
    it("computes totals, per-model, per-task-type, per-pattern and gaps", async () => {
      write([
        rec({
          runId: "1",
          model: "a",
          runMs: 100,
          taskType: "chat",
          pattern: "p1",
          costUsd: 0.1,
          tokensIn: 10,
          tokensOut: 5,
        },),
        rec({
          runId: "2",
          model: "a",
          runMs: 300,
          taskType: "chat",
          pattern: "p1",
          result: "error",
          toolingGap: "g1",
        },),
        rec({
          runId: "3",
          model: "b",
          runMs: 200,
          taskType: "aux",
          pattern: "p2",
          result: "timeout",
          toolingGap: "g1",
        },),
      ],);
      const s = await stats();
      expect(s.totals.runs,).toBe(3,);
      expect(s.totals.failures,).toBe(2,);
      expect(s.totals.avgMs,).toBe(200,);
      expect(s.totals.tokensIn,).toBe(10,);
      expect(s.totals.tokensOut,).toBe(5,);

      const a = s.byModel.find((m,) => m.model === "a");
      expect(a?.runs,).toBe(2,);
      expect(a?.failures,).toBe(1,);
      expect(a?.avgMs,).toBe(200,);
      expect(s.byModel.find((m,) => m.model === "b")?.runs,).toBe(1,);
      expect(s.byModel[0]?.model,).toBe("a",);

      expect(s.byTaskType.find((t,) => t.taskType === "chat")?.avgMs,).toBe(200,);
      expect(s.byPattern.find((p,) => p.pattern === "p1")?.failures,).toBe(1,);
      expect(s.toolingGaps,).toEqual([{ toolingGap: "g1", count: 2, },],);
    });

    it("labels empty model and pattern buckets rather than dropping them", async () => {
      write([rec({ runId: "1", model: "", pattern: "", },),],);
      const s = await stats();
      expect(s.byModel.map((m,) => m.model),).toEqual(["(unknown)",],);
      expect(s.byPattern.map((p,) => p.pattern),).toEqual(["(none)",],);
    });

    it("returns all-zero totals for an empty log", async () => {
      writeFileSync(log, "",);
      setExecLogPath(log,);
      const s = await stats();
      expect(s.totals,).toEqual({ runs: 0, failures: 0, costUsd: 0, tokensIn: 0, tokensOut: 0, avgMs: 0, },);
      expect(s.byModel,).toEqual([],);
      expect(s.toolingGaps,).toEqual([],);
    });

    it("rounds cost to 4 decimals so rollups stay stable", async () => {
      write([
        rec({ runId: "1", costUsd: 0.001, },),
        rec({ runId: "2", costUsd: 0.002, },),
        rec({ runId: "3", costUsd: 0.0005, },),
      ],);
      const s = await stats();
      expect(s.totals.costUsd,).toBe(0.0035,);
    });

    it("excludes a null cost from the rollup instead of counting it as free", async () => {
      // An unpriced provider yields cost_usd: null. Summing that as 0 would
      // silently under-report, so the total covers only the priced runs.
      write([
        rec({ runId: "1", model: "priced", costUsd: 0.002, },),
        rec({ runId: "2", model: "unpriced", costUsd: null, },),
      ],);
      const s = await stats();
      expect(s.totals.costUsd,).toBe(0.002,);
      expect(s.byModel.find((m,) => m.model === "unpriced")?.costUsd,).toBe(0,);
    });

    it("reports a null cost as 0 in the summary row but null in the record", async () => {
      write([rec({ runId: "u", costUsd: null, },),],);
      const [record,] = await listRuns({}, 1,);
      expect(record?.costUsd,).toBeNull();
      // The API row must stay numeric for TypeBox Type.Number() consumers.
      expect(toSummary(record!,).costUsd,).toBe(0,);
    });
  });
});
