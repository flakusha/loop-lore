// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Exec-log tests: wire round-trip, the snake_case on-disk shape, and the
 * best-effort contract (a write failure must never escape to the caller).
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { basename, dirname, isAbsolute, join, } from "node:path";
import { resolveDbPath, resolveInstanceDir, resolveInstanceSlug, } from "../config/state-dir";
import { getLogger, type Logger, setGlobalLogger, } from "../logger";
import {
  appendExecLog,
  getExecLogCounters,
  getExecLogPath,
  HARNESS_DIR,
  HARNESS_LOG_FILENAME,
  resetExecLogCounters,
  resetExecLogPath,
  setExecLogPath,
} from "./exec-log";
import { buildRunRecord, } from "./exec-recorder";
import { deserializeRun, HARNESS_RESULTS, type HarnessRunRecord, serializeRun, } from "./types";

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
    turnId: "turn-1",
    profile: null,
    tier: null,
    acpSessionId: null,
    instanceId: null,
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
      "acp_session_id",
      "branch",
      "cost_usd",
      "error",
      "git_sha",
      "instance_id",
      "model",
      "msg",
      "pattern",
      "pattern_detail",
      "pid",
      "profile",
      "result",
      "run_id",
      "run_ms",
      "task",
      "task_type",
      "tier",
      "tokens_in",
      "tokens_out",
      "tool_count",
      "tooling_gap",
      "tools",
      "ts",
      "turn_id",
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
    // A line with NO result is not a success: the log is append-only, so a
    // torn or hand-written line must not read as a successful run.
    expect(record?.result,).toBe("error",);
    expect(record?.taskType,).toBe("other",);
    // An absent cost_usd means "unknown", not "free" — it must NOT coerce to 0.
    expect(record?.costUsd,).toBeNull();
    // A line written before per-instance attribution has no instance_id key.
    expect(record?.instanceId,).toBeNull();
  });

  it("reads a non-union result back as a known member, never a number", () => {
    // A numeric `result` used to leak a number into a field the response
    // schema declares as a string, which makes the admin client's
    // whole-envelope decode fail and empties the whole runs table.
    const numeric = deserializeRun('{"run_id":"r","ts":"t","result":42}',);
    expect(numeric?.result,).toBe("error",);
    expect(typeof numeric?.result,).toBe("string",);

    // An unknown outcome is coerced to "error" too — never passed through raw.
    const unknown = deserializeRun('{"run_id":"r","ts":"t","result":"WEIRD_RESULT"}',);
    expect(unknown?.result,).toBe("error",);

    // A known member survives untouched.
    expect(deserializeRun('{"run_id":"r","ts":"t","result":"timeout"}',)?.result,).toBe("timeout",);
    expect(deserializeRun('{"run_id":"r","ts":"t","result":"ok"}',)?.result,).toBe("ok",);
  });

  it("keeps the exported result union and the coercion in step", () => {
    // The union is the runtime source of truth for the outcome list and the
    // coercion is derived from it, so every member must survive the read and
    // nothing outside it may read as an outcome at all.
    expect(HARNESS_RESULTS,).toEqual(["ok", "error", "timeout", "cancelled",],);

    for (const result of HARNESS_RESULTS) {
      expect(deserializeRun(`{"run_id":"r","ts":"t","result":"${result}"}`,)?.result,).toBe(result,);
    }
  });

  it("reads a pre-turn_id line as turnId null instead of rejecting it", () => {
    // A line written before this key existed, verbatim: full identity fields,
    // every other optional field present, and NO turn_id key at all. It has to
    // survive the parse — dropping every historical line would blank the log.
    const legacy = JSON.stringify({
      run_id: "run-legacy",
      ts: "2026-09-01T10:00:00Z",
      run_ms: 812,
      task: "generate",
      task_type: "chat",
      model: "gpt-legacy",
      tools: ["read",],
      tool_count: 1,
      pattern: "none",
      pattern_detail: "",
      result: "ok",
      error: null,
      tooling_gap: null,
      cost_usd: 0.001,
      tokens_in: 10,
      tokens_out: 5,
      branch: "main",
      pid: 99,
      git_sha: "deadbee",
      msg: null,
    },);

    const record = deserializeRun(legacy,);
    expect(record,).not.toBeNull();
    expect(record?.runId,).toBe("run-legacy",);
    expect(record?.turnId,).toBeNull();
  });

  it("never lets a non-string turn_id through as a turn id", () => {
    // Same defensive style as branch/git_sha: a hand-written 123 must not
    // surface as a truthy turnId that no record was ever written under.
    expect(deserializeRun('{"run_id":"r","ts":"t","turn_id":123}',)?.turnId,).toBeNull();
    expect(deserializeRun('{"run_id":"r","ts":"t","turn_id":{"a":1}}',)?.turnId,).toBeNull();
    expect(deserializeRun('{"run_id":"r","ts":"t","turn_id":"turn-9"}',)?.turnId,).toBe("turn-9",);
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
    it("resolves to <instance-dir>/harness/executions.jsonl and memoizes it", () => {
      resetExecLogPath();
      const resolved = getExecLogPath();
      // The log lives in the instance state dir, so two instances never share
      // one file. Assert the shape, not the absolute path.
      if (resolved !== null) {
        expect(resolved.endsWith(join(HARNESS_DIR, HARNESS_LOG_FILENAME,),),).toBe(true,);
        expect(isAbsolute(resolved,),).toBe(true,);
        expect(resolved.startsWith(resolveInstanceDir(process.env,),),).toBe(true,);
      }

      // Memoized: a second call returns the identical value without re-resolving.
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

  describe("counters", () => {
    beforeEach(() => {
      resetExecLogCounters();
    },);

    afterEach(() => {
      resetExecLogCounters();
    },);

    it("counts every record handed to the writer", () => {
      setExecLogPath(null,);
      appendExecLog(sample({ runId: "r1", },),);
      appendExecLog(sample({ runId: "r2", },),);

      expect(getExecLogCounters().runs,).toBe(2,);
      expect(getExecLogCounters().errors,).toBe(0,);
    });

    it("counts non-ok results by kind", () => {
      setExecLogPath(null,);
      appendExecLog(sample({ result: "error", },),);
      appendExecLog(sample({ result: "timeout", },),);
      appendExecLog(sample({ result: "cancelled", },),);

      const counters = getExecLogCounters();
      expect(counters.runs,).toBe(3,);
      expect(counters.errors,).toBe(3,);
      expect(counters.byKind,).toEqual({ error: 1, timeout: 1, cancelled: 1, },);
    });

    it("sums the priced runs and ignores an unpriced one", () => {
      setExecLogPath(null,);
      appendExecLog(sample({ costUsd: 0.0042, },),);
      appendExecLog(sample({ costUsd: null, },),);

      expect(getExecLogCounters().spendUsd,).toBeCloseTo(0.0042, 6,);
    });

    it("a non-finite cost does not poison the spend counter", () => {
      setExecLogPath(null,);
      appendExecLog(sample({ costUsd: 0.0042, },),);
      appendExecLog(sample({ costUsd: Number.NaN, },),);
      appendExecLog(sample({ costUsd: 0.0058, },),);

      expect(getExecLogCounters().spendUsd,).toBeCloseTo(0.01, 6,);
    });

    it("counts a run even when the log path is unavailable", () => {
      setExecLogPath(null,);
      appendExecLog(sample(),);
      expect(getExecLogCounters().runs,).toBe(1,);
    });

    it("breaks dispatches down by task type and profile", () => {
      setExecLogPath(null,);
      appendExecLog(sample({ runId: "a", taskType: "chat", profile: "p", },),);
      appendExecLog(sample({ runId: "b", taskType: "chat", profile: "p", },),);
      // An internal provider dispatch carries no profile: counted by task
      // type, absent from the per-profile breakdown (a null key would render
      // as a label nothing can filter on).
      appendExecLog(sample({ runId: "c", taskType: "aux", profile: null, },),);

      const counters = getExecLogCounters();
      expect(counters.byTaskType,).toEqual({ chat: 2, aux: 1, },);
      expect(counters.byProfile,).toEqual({ p: 2, },);
    });
  });
});

describe("instance-scoped exec log (F13/H6/H12)", () => {
  const ENV_STATE = "LOOP_LORE_STATE_DIR";
  const ENV_INSTANCE = "LOOP_LORE_INSTANCE";
  const ENV_DB = "LOOP_LORE_DB_PATH";
  let savedState: string | undefined;
  let savedInstance: string | undefined;
  let savedDb: string | undefined;
  let stateRoot = "";

  beforeEach(() => {
    savedState = process.env[ENV_STATE];
    savedInstance = process.env[ENV_INSTANCE];
    savedDb = process.env[ENV_DB];
    delete process.env[ENV_DB];
    stateRoot = mkdtempSync(join(tmpdir(), "loop-lore-harness-",),);
    process.env[ENV_STATE] = stateRoot;
    process.env[ENV_INSTANCE] = "alpha";
    resetExecLogPath();
  },);

  afterEach(() => {
    resetExecLogPath();
    if (savedState === undefined) { delete process.env[ENV_STATE]; }
    else { process.env[ENV_STATE] = savedState; }

    if (savedInstance === undefined) { delete process.env[ENV_INSTANCE]; }
    else { process.env[ENV_INSTANCE] = savedInstance; }

    if (savedDb === undefined) { delete process.env[ENV_DB]; }
    else { process.env[ENV_DB] = savedDb; }

    rmSync(stateRoot, { recursive: true, force: true, },);
  },);

  it("writes each instance's records into its own log under its state dir", () => {
    appendExecLog(sample({ runId: "alpha-1", },),);
    const alphaPath = getExecLogPath();
    expect(alphaPath,).toBe(join(stateRoot, "alpha", HARNESS_DIR, HARNESS_LOG_FILENAME,),);

    process.env[ENV_INSTANCE] = "beta";
    resetExecLogPath();
    appendExecLog(sample({ runId: "beta-1", },),);
    const betaPath = getExecLogPath();
    expect(betaPath,).toBe(join(stateRoot, "beta", HARNESS_DIR, HARNESS_LOG_FILENAME,),);
    expect(betaPath,).not.toBe(alphaPath,);

    // Each file holds only its own instance's records.
    const alphaLines = readFileSync(alphaPath!, "utf8",).trim().split("\n",);
    expect(alphaLines,).toHaveLength(1,);
    expect(alphaLines[0],).toContain("alpha-1",);
    expect(alphaLines[0],).not.toContain("beta-1",);
  });

  it("stamps the instance slug on every record", () => {
    appendExecLog(sample({ runId: "alpha-1", },),);
    const line = readFileSync(getExecLogPath()!, "utf8",).trim();
    expect(deserializeRun(line,)?.instanceId,).toBe("alpha",);
  });

  it("uses the same slug the DB path resolver picks (one source of truth)", () => {
    appendExecLog(sample({ runId: "alpha-1", },),);
    const line = readFileSync(getExecLogPath()!, "utf8",).trim();
    const slug = resolveInstanceSlug(process.env,);
    expect(deserializeRun(line,)?.instanceId,).toBe(slug,);
    // The DB path resolver picks the same slug for the same env.
    expect(basename(dirname(resolveDbPath(process.env,),),),).toBe(slug,);
  });

  it("the recorder's bind-aware stamp matches the bind-aware DB path", () => {
    const savedPort = process.env["PORT"];
    delete process.env[ENV_INSTANCE];
    delete process.env["PORT"];
    try {
      const record = buildRunRecord({ taskType: "chat", model: "m", runMs: 1, result: "ok", }, { port: 7169, },);
      expect(record.instanceId,).toBe("port-7169",);
      expect(basename(dirname(resolveDbPath(process.env, { port: 7169, },),),),).toBe("port-7169",);
    } finally {
      if (savedPort === undefined) { delete process.env["PORT"]; }
      else { process.env["PORT"] = savedPort; }
    }
  });
});

/** The repo-root log left by pre-instance runs; its presence is the trigger. */
const LEGACY_EXEC_LOG = join(import.meta.dir, "..", "..", ".harness", HARNESS_LOG_FILENAME,);

/**
 * Capture the structured warnings emitted by `run`.
 * @param run - code under test
 * @returns rendered warning lines
 */
function captureWarns(run: () => void,): string[] {
  const lines: string[] = [];
  let previous: Logger | null = null;
  try {
    previous = getLogger();
  } catch {
    // No root logger installed — nothing to restore.
  }

  setGlobalLogger({
    child: () => ({
      warn: (message: string, meta?: unknown,) => {
        lines.push(`${message} ${JSON.stringify(meta,)}`,);
      },
    }),
  } as unknown as Logger,);

  try {
    run();
  } finally {
    if (previous !== null) { setGlobalLogger(previous,); }
  }

  return lines;
}

describe("legacy exec-log notice (M3)", () => {
  it("warns once per process and re-arms after resetExecLogPath", () => {
    const existed = existsSync(LEGACY_EXEC_LOG,);
    if (!existed) {
      mkdirSync(dirname(LEGACY_EXEC_LOG,), { recursive: true, },);
      writeFileSync(LEGACY_EXEC_LOG, "",);
    }

    try {
      const first = captureWarns(() => {
        resetExecLogPath();
        getExecLogPath();
        getExecLogPath();
      },);

      expect(first,).toHaveLength(1,);
      expect(first[0],).toContain(LEGACY_EXEC_LOG,);

      const second = captureWarns(() => {
        resetExecLogPath();
        getExecLogPath();
      },);

      expect(second,).toHaveLength(1,);
    } finally {
      if (!existed) { rmSync(LEGACY_EXEC_LOG,); }

      resetExecLogPath();
    }
  });
});
