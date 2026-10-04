// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { formatDuration, formatEmptyRuns, formatRunDetail, formatRunLine, truncateTask, } from "./display";
import type { HarnessRunDetail, HarnessRunSummary, } from "./types";

describe("formatDuration", () => {
  it("formats milliseconds under 1s", () => {
    expect(formatDuration(0,),).toBe("0ms",);
    expect(formatDuration(500,),).toBe("500ms",);
    expect(formatDuration(999,),).toBe("999ms",);
  });

  it("formats seconds for sub-minute durations", () => {
    expect(formatDuration(1000,),).toBe("1.0s",);
    expect(formatDuration(1500,),).toBe("1.5s",);
    // Last ms before the guard: one more ms rounds up to a full minute.
    expect(formatDuration(59_949,),).toBe("59.9s",);
  });

  it("falls to the minute arm before a sub-minute value rounds up to 60s", () => {
    expect(formatDuration(59_999,),).not.toContain("60.0s",);
  });

  it("formats minutes and seconds for longer durations", () => {
    expect(formatDuration(60_000,),).toBe("1m0s",);
    expect(formatDuration(90_000,),).toBe("1m30s",);
    expect(formatDuration(3_600_000,),).toBe("60m0s",);
  });
});

describe("truncateTask", () => {
  it("returns short tasks unchanged", () => {
    expect(truncateTask("fix bug",),).toBe("fix bug",);
    expect(truncateTask("a".repeat(48,),),).toBe("a".repeat(48,),);
  });

  it("truncates long tasks with ellipsis", () => {
    const long = "a".repeat(100,);
    const result = truncateTask(long,);
    expect(result.length,).toBe(48,);
    expect(result.endsWith("…",),).toBe(true,);
  });

  it("exactly-max-length tasks are returned unchanged", () => {
    expect(truncateTask("a".repeat(47,),),).toBe("a".repeat(47,),);
  });
});

describe("formatRunLine", () => {
  const makeSummary = (overrides: Partial<HarnessRunSummary> = {},): HarnessRunSummary => ({
    runId: "run-1",
    ts: "2026-01-01T00:00:00Z",
    durationMs: 12_000,
    task: "Implement feature X",
    taskType: "chat",
    model: "gpt-4o",
    toolCount: 3,
    result: "ok",
    error: null,
    costUsd: 0.05,
    tokensIn: 1000,
    tokensOut: 500,
    branch: "main",
    gitSha: "abc123def456",
    pid: 12345,
    turnId: "turn-1",
    ...overrides,
  });

  it("includes duration and model", () => {
    const line = formatRunLine(makeSummary({ durationMs: 90_000, model: "claude-3-5", },),);
    expect(line,).toContain("1m30s",);
    expect(line,).toContain("[claude-3-5]",);
  });

  it("includes task (truncated if long)", () => {
    const longTask = "x".repeat(80,);
    const line = formatRunLine(makeSummary({ task: longTask, },),);
    expect(line,).not.toContain(longTask,);
    expect(line,).toContain("x".repeat(47,),);
  });

  it("renders a failed run with error marker", () => {
    const line = formatRunLine(makeSummary({ error: "oops", result: "error", },),);
    expect(line,).toContain("✘",);
    expect(line,).toContain("{red-fg",);
  });

  it("renders a successful run with ok marker", () => {
    const line = formatRunLine(makeSummary({ error: null, result: "ok", },),);
    expect(line,).toContain("✔",);
    expect(line,).toContain("{green-fg",);
  });

  it("marks a non-ok result as failed even when error is null", () => {
    const line = formatRunLine(makeSummary({ result: "timeout", error: null, },),);
    expect(line,).toContain("✘",);
  });

  it("shows token count", () => {
    const line = formatRunLine(makeSummary({ tokensIn: 2000, tokensOut: 1000, },),);
    expect(line,).toContain("+3000t",);
  });

  it("shows cost", () => {
    const line = formatRunLine(makeSummary({ costUsd: 0.23, },),);
    expect(line,).toContain("$0.23",);
  });

  it("shows sub-cent cost with extra precision", () => {
    const line = formatRunLine(makeSummary({ costUsd: 0.0003, },),);
    expect(line,).toContain("<0.001",);
  });
});

describe("formatEmptyRuns", () => {
  it("contains the empty-state indicator", () => {
    expect(formatEmptyRuns(),).toContain("No harness runs",);
  });
});

describe("formatRunDetail", () => {
  const makeDetail = (overrides: Partial<HarnessRunDetail> = {},): HarnessRunDetail => ({
    runId: "run-42",
    ts: "2026-01-01T12:34:56.789Z",
    durationMs: 67_890,
    task: "Refactor the widget factory",
    taskType: "auto-gen",
    model: "claude-sonnet",
    toolCount: 5,
    result: "ok",
    error: null,
    costUsd: 0.1234,
    tokensIn: 3000,
    tokensOut: 1500,
    branch: null,
    gitSha: null,
    pid: null,
    turnId: null,
    tools: ["read", "write", "bash", "grep", "edit",],
    pattern: "agent.edit",
    // "" is what the server actually sends for a run with no pattern detail:
    // `patternDetail` is a plain string on the record, never null.
    patternDetail: "",
    toolingGap: null,
    msg: null,
    ...overrides,
  });

  it("includes run id and duration", () => {
    const detail = formatRunDetail(makeDetail({ durationMs: 5000, },),);
    expect(detail,).toContain("run-42",);
    expect(detail,).toContain("5.0s",);
  });

  it("includes task and model", () => {
    const detail = formatRunDetail(makeDetail({ task: "My custom task", model: "my-model", },),);
    expect(detail,).toContain("My custom task",);
    expect(detail,).toContain("my-model",);
  });

  it("renders an error line when error is present", () => {
    const detail = formatRunDetail(makeDetail({ error: "segmentation fault", },),);
    expect(detail,).toContain("segmentation fault",);
    expect(detail,).toContain("{red-fg",);
  });

  it("does not include error block when error is null", () => {
    const detail = formatRunDetail(makeDetail({ error: null, },),);
    expect(detail,).not.toContain("Error:",);
  });

  it("includes tool list", () => {
    const detail = formatRunDetail(makeDetail({ tools: ["read", "write",], toolCount: 2, },),);
    expect(detail,).toContain("read, write",);
  });

  it("includes pattern and patternDetail", () => {
    const detail = formatRunDetail(makeDetail({
      pattern: "agent.edit",
      patternDetail: "inline patch",
    },),);
    expect(detail,).toContain("agent.edit / inline patch",);
  });

  it("includes tooling gap when present", () => {
    const detail = formatRunDetail(makeDetail({ toolingGap: "no file diff tool", },),);
    expect(detail,).toContain("no file diff tool",);
  });

  it("omits tooling gap when null", () => {
    const detail = formatRunDetail(makeDetail({ toolingGap: null, },),);
    expect(detail,).not.toContain("Tooling gap:",);
  });

  it("truncates git sha to 7 characters", () => {
    const detail = formatRunDetail(makeDetail({ gitSha: "deadbeef123456", },),);
    expect(detail,).toContain("deadbee",);
    expect(detail,).not.toContain("deadbeef123456",);
  });

  it("includes pid", () => {
    const detail = formatRunDetail(makeDetail({ pid: 42, },),);
    expect(detail,).toContain("42",);
  });

  it("includes msg when present", () => {
    const detail = formatRunDetail(makeDetail({ msg: "hello world", },),);
    expect(detail,).toContain("hello world",);
  });

  it("omits msg block when empty", () => {
    const detail = formatRunDetail(makeDetail({ msg: "", },),);
    expect(detail,).not.toContain("Msg:",);
  });

  it("renders null branch and gitSha as dashes", () => {
    const detail = formatRunDetail(makeDetail({ branch: null, gitSha: null, },),);
    expect(detail,).toContain("{bold}Branch:{/bold} —  {bold}SHA:{/bold} —",);
  });

  it("renders null pid as dash", () => {
    const detail = formatRunDetail(makeDetail({ pid: null, },),);
    expect(detail,).toContain("{bold}PID:{/bold} —",);
  });

  it("shows the turn id so a turn's rounds are recognizable", () => {
    expect(formatRunDetail(makeDetail({ turnId: "turn-7", },),),).toContain("{bold}Turn:{/bold} turn-7",);
  });

  it("renders a null turn id as a dash", () => {
    expect(formatRunDetail(makeDetail({ turnId: null, },),),).toContain("{bold}Turn:{/bold} —",);
  });

  it("renders an empty patternDetail without a trailing separator", () => {
    const detail = formatRunDetail(makeDetail({ patternDetail: "", },),);
    expect(detail,).not.toContain("undefined",);
    expect(detail,).toContain("Pattern:",);
  });

  it("renders null msg as omitted", () => {
    const detail = formatRunDetail(makeDetail({ msg: null, },),);
    expect(detail,).not.toContain("Msg:",);
  });
});
