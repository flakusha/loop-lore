// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Recorder + egress-seam tests. These drive `callWithFailover` and read the
 * REAL jsonl the writer produced (via `setExecLogPath`), so the write path,
 * the cost math, and the routing-signal mapping are all covered end to end —
 * not stubbed at the module boundary like the route tests.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, } from "node:fs";
import { join, } from "node:path";
import { callWithFailover, } from "../generation/providers/call-with-failover";
import type { GenerateResponse, LLMProvider, } from "../generation/providers/types";
import { INTERACTIVE_TURN, toTaskSignal, } from "../generation/routing/task-signal";
import { resetExecLogPath, setExecLogPath, } from "./exec-log";
import { buildRunRecord, computeCostUsd, recordExecRun, } from "./exec-recorder";
import { getRun, listRuns, } from "./query";
import { LOG_PID, resetGitContext, } from "./run-context";

const TMP_ROOT = ".tmp/harness-recorder";

/** A provider that answers with fixed usage and optional cost metadata. */
function provider(overrides: Partial<LLMProvider> = {},): LLMProvider {
  const response: GenerateResponse = {
    content: "hi",
    finishReason: "stop",
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, },
  };
  return {
    capabilities: {
      type: "openai-compatible",
      label: "p",
      text: true,
      image: false,
      embeddings: false,
      streaming: false,
      tools: false,
      thinking: false,
      ...overrides.capabilities,
    },
    complete: async () => response,
    stream: async () => response,
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
    ...overrides,
  };
}

/** One recorded run's cost, or null when unpriced. */
function cost(overrides: Parameters<typeof computeCostUsd>[0],): number | null {
  return computeCostUsd(overrides,);
}

describe("harness exec recorder", () => {
  let dir: string;
  let log: string;

  beforeEach(() => {
    mkdirSync(TMP_ROOT, { recursive: true, },);
    dir = mkdtempSync(join(TMP_ROOT, "fixture-",),);
    log = join(dir, "executions.jsonl",);
    setExecLogPath(log,);
    resetGitContext();
  },);

  afterEach(() => {
    resetExecLogPath();
    rmSync(dir, { recursive: true, force: true, },);
  },);

  describe("computeCostUsd", () => {
    it("prices a run from the provider rate", () => {
      // 150 tokens at $0.002/1k = $0.0003
      expect(
        cost({
          taskType: "chat",
          model: "m",
          runMs: 1,
          result: "ok",
          costPer1kTokens: 0.002,
          usage: { promptTokens: 100, completionTokens: 50, },
        },),
      ).toBe(0.0003,);
    });

    it("returns null — never 0 — when the provider declares no price", () => {
      const base = {
        taskType: "chat" as const,
        model: "m",
        runMs: 1,
        result: "ok" as const,
        usage: { promptTokens: 10, completionTokens: 5, },
      };
      expect(cost(base,),).toBeNull();
      expect(cost({ ...base, costPer1kTokens: Number.NaN, },),).toBeNull();
      expect(cost({ ...base, costPer1kTokens: -1, },),).toBeNull();
    });

    it("returns null when a price exists but no usage was reported", () => {
      expect(cost({ taskType: "chat", model: "m", runMs: 1, result: "ok", costPer1kTokens: 0.002, },),).toBeNull();
    });
  });

  describe("buildRunRecord", () => {
    it("fills provenance, tool count, and defaults from a bare input", () => {
      const r = buildRunRecord({ taskType: "chat", model: "m", runMs: 7, result: "ok", },);
      expect(r.taskType,).toBe("chat",);
      expect(r.task,).toBe("chat",);
      expect(r.toolCount,).toBe(0,);
      expect(r.pattern,).toBe("none",);
      expect(r.patternDetail,).toBe("",);
      expect(r.costUsd,).toBeNull();
      expect(r.pid,).toBe(LOG_PID,);
      expect(r.runMs,).toBe(7,);
      // runId is a fresh uuid per record, never a reused constant.
      expect(r.runId,).not.toBe(buildRunRecord({ taskType: "chat", model: "m", runMs: 7, result: "ok", },).runId,);
    });

    it("counts the tools it was given", () => {
      const r = buildRunRecord({ taskType: "chat", model: "m", runMs: 1, result: "ok", tools: ["read", "write",], },);
      expect(r.toolCount,).toBe(2,);
      expect(r.tools,).toEqual(["read", "write",],);
    });
  });

  describe("recordExecRun writes a real line", () => {
    it("appends a parseable record the query side can read back", async () => {
      recordExecRun({
        taskType: "aux",
        model: "aux-model",
        runMs: 12,
        result: "ok",
        usage: { promptTokens: 8, completionTokens: 4, },
        costPer1kTokens: 0.001,
        task: "aux:intent",
        pattern: "p",
        patternDetail: "d",
      },);
      const runs = await listRuns({}, 10,);
      expect(runs,).toHaveLength(1,);
      const r = runs[0]!;
      expect(r.task,).toBe("aux:intent",);
      expect(r.taskType,).toBe("aux",);
      expect(r.tokensIn,).toBe(8,);
      expect(r.tokensOut,).toBe(4,);
      expect(r.costUsd,).toBeCloseTo(0.000012, 1e-9,);
      expect(r.pattern,).toBe("p",);
      // Provenance is filled from real git, so it must at least be a string slot.
      expect("branch" in r,).toBe(true,);
      // The on-disk line is snake_case, not the camelCase record.
      const raw = readFileSync(log, "utf8",).trim();
      expect(raw.includes('"run_id":',),).toBe(true,);
      expect(raw.includes('"tokens_in":',),).toBe(true,);
    });

    it("never throws when the log path is unwritable", () => {
      setExecLogPath(join(dir, "no-such-dir", "x", "..", "\u0000bad", "log.jsonl",),);
      expect(() => recordExecRun({ taskType: "chat", model: "m", runMs: 1, result: "ok", },)).not.toThrow();
    });
  });

  describe("callWithFailover emits at the egress seam", () => {
    it("logs a success with tokens, tools, and the routed task type", async () => {
      await callWithFailover(
        [{
          name: "p1",
          provider: provider({ capabilities: { ...provider().capabilities, costPer1kTokens: 0.002, }, },),
        },],
        {
          model: "m1",
          messages: [],
          params: {},
          tools: [{ type: "function", function: { name: "read", description: "read a file", parameters: {}, }, },],
          harness: { taskType: INTERACTIVE_TURN.taskType, task: "generate-route", },
        },
      );
      const runs = await listRuns({}, 10,);
      expect(runs,).toHaveLength(1,);
      expect(runs[0]?.result,).toBe("ok",);
      expect(runs[0]?.taskType,).toBe("chat",);
      expect(runs[0]?.tools,).toEqual(["read",],);
      expect(runs[0]?.tokensIn,).toBe(100,);
      expect(runs[0]?.costUsd,).toBeCloseTo(0.0003, 1e-9,);
    });

    it("maps an AUX signal to the aux bucket", async () => {
      await callWithFailover(
        [{ name: "p1", provider: provider(), },],
        { model: "m1", messages: [], params: {}, harness: { taskType: toTaskSignal("intent",).taskType, }, },
      );
      expect((await listRuns({}, 10,))[0]?.taskType,).toBe("aux",);
    });

    it("logs a cancelled call as cancelled, not as a provider error", async () => {
      const controller = new AbortController();
      controller.abort();
      try {
        await callWithFailover(
          [{
            name: "p1",
            provider: provider({
              complete: async () => {
                throw new Error("aborted",);
              },
            },),
          },],
          {
            model: "m1",
            messages: [],
            params: {},
            signal: controller.signal,
            harness: { taskType: "interactive-turn", },
          },
        );
      } catch {
        // the cancellation propagates, as it must
      }
      const runs = await listRuns({}, 10,);
      expect(runs[0]?.result,).toBe("cancelled",);
    });

    it("logs the total failure when every provider fails", async () => {
      const failing = provider({
        complete: async () => {
          throw new Error("boom",);
        },
      },);
      await expect(
        callWithFailover(
          [{ name: "p1", provider: failing, },],
          { model: "m1", messages: [], params: {}, harness: { taskType: "interactive-turn", }, },
        ),
      ).rejects.toThrow("All providers failed",);
      const runs = await listRuns({}, 10,);
      expect(runs[0]?.result,).toBe("error",);
      expect(runs[0]?.error,).toContain("All providers failed",);
    });

    it("logs nothing when no harness context is attached", async () => {
      await callWithFailover(
        [{ name: "p1", provider: provider(), },],
        { model: "m1", messages: [], params: {}, },
      );
      expect(await listRuns({}, 10,),).toEqual([],);
    });

    it("keeps the record findable by id through getRun", async () => {
      await callWithFailover(
        [{ name: "p1", provider: provider(), },],
        { model: "m1", messages: [], params: {}, harness: { taskType: "interactive-turn", }, },
      );
      const [first,] = await listRuns({}, 10,);
      expect((await getRun(first!.runId,))?.model,).toBe("m1",);
      expect(await getRun("no-such-run",),).toBeNull();
    });
  });
});
