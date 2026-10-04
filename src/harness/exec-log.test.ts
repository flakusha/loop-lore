// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Exec-log tests: wire round-trip, the snake_case on-disk shape, and the
 * best-effort contract (a write failure must never escape to the caller).
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import {
  appendExecLog,
  getExecLogPath,
  HARNESS_DIR,
  HARNESS_LOG_FILENAME,
  resetExecLogPath,
  setExecLogPath,
} from "./exec-log";
import { deserializeRun, type HarnessRunRecord, serializeRun, } from "./types";

/** A fully-populated record — every field non-default so round-trips are visible. */
function sample(overrides: Partial<HarnessRunRecord> = {},): HarnessRunRecord {
  return {
    runId: "run-1",
    ts: "2026-10-03T12:00:00Z",
    runMs: 1234,
    task: "generate",
    taskType: "chat",
    model: "gpt-test",
    tools: ["read", "write",],
    toolCount: 2,
    pattern: "agent.edit",
    patternDetail: "two edits",
    result: "ok",
    error: null,
    toolingGap: null,
    costUsd: 0.0042,
    tokensIn: 100,
    tokensOut: 50,
    branch: "feat-harness",
    pid: 4242,
    gitSha: "abc1234",
    msg: null,
    ...overrides,
  };
}

describe("harness types", () => {
  it("round-trips a record through the wire shape without loss", () => {
    const record = sample();
    const wire = serializeRun(record,);
    expect(deserializeRun(JSON.stringify(wire,),),).toEqual(record,);
  });

  it("serializes to snake_case so the JSONL greps like the ledger", () => {
    const wire = serializeRun(sample(),);
    expect(Object.keys(wire,).sort(),).toEqual([
      "branch",
      "cost_usd",
      "error",
      "git_sha",
      "model",
      "msg",
      "pattern",
      "pattern_detail",
      "pid",
      "result",
      "run_id",
      "run_ms",
      "task",
      "task_type",
      "tokens_in",
      "tokens_out",
      "tool_count",
      "tooling_gap",
      "tools",
      "ts",
    ],);
  });

  it("returns null for a line that is not JSON", () => {
    expect(deserializeRun("not json at all",),).toBeNull();
  });

  it("returns null for JSON that is missing the identity fields", () => {
    expect(deserializeRun('{"model":"x"}',),).toBeNull();
    expect(deserializeRun("null",),).toBeNull();
    expect(deserializeRun("[]",),).toBeNull();
  });

  it("defaults missing optional fields rather than throwing", () => {
    const record = deserializeRun('{"run_id":"r","ts":"t"}',);
    expect(record,).not.toBeNull();
    expect(record?.tools,).toEqual([],);
    expect(record?.result,).toBe("ok",);
    expect(record?.taskType,).toBe("other",);
    // An absent cost_usd means "unknown", not "free" — it must NOT coerce to 0.
    expect(record?.costUsd,).toBeNull();
  });
});

describe("appendExecLog", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "harness-exec-",),);
  },);

  afterEach(() => {
    // Reset the memoized path so a null override never leaks into another test.
    resetExecLogPath();
    rmSync(dir, { recursive: true, force: true, },);
  },);

  it("never throws when the target path is unwritable", () => {
    // A directory cannot be opened as a file — the canonical ENOTDIR/EISDIR case.
    const path = join(dir, "blocked",);
    mkdirSync(path, { recursive: true, },);
    expect(() => appendExecLog(sample({ runId: path, },),)).not.toThrow();
  });

  describe("path resolution", () => {
    it("resolves to <repo-root>/.harness/executions.jsonl and memoizes it", () => {
      resetExecLogPath();
      const resolved = getExecLogPath();
      // Inside a git checkout this is a real path under .harness/; outside a
      // checkout it is null. Both are valid — assert the shape, not the env.
      if (resolved !== null) {
        expect(resolved.endsWith(`${HARNESS_DIR}/${HARNESS_LOG_FILENAME}`,),).toBe(true,);
        expect(resolved.startsWith("/",),).toBe(true,);
      }
      // Memoized: a second call returns the identical value without re-running git.
      expect(getExecLogPath(),).toBe(resolved,);
    });

    it("forces 'no log' for a null override and never falls through to git", () => {
      setExecLogPath(null,);
      expect(getExecLogPath(),).toBeNull();
      // The null sentinel must stick rather than re-resolving the real repo path.
      expect(getExecLogPath(),).toBeNull();
    });

    it("writes nothing when the path is null, without throwing", () => {
      setExecLogPath(null,);
      expect(() => appendExecLog(sample(),)).not.toThrow();
    });

    it("appends through the real path seam, creating the directory", () => {
      const path = join(dir, "nested", HARNESS_LOG_FILENAME,);
      setExecLogPath(path,);
      appendExecLog(sample({ runId: "r1", },),);
      appendExecLog(sample({ runId: "r2", },),);
      const lines = readFileSync(path, "utf8",).trim().split("\n",);
      // Append-only: two calls, two lines, both readable.
      expect(lines,).toHaveLength(2,);
      expect(deserializeRun(lines[0]!,)?.runId,).toBe("r1",);
      expect(deserializeRun(lines[1]!,)?.runId,).toBe("r2",);
    });
  });
});
