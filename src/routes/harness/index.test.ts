// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the three harness endpoints: the admin guard denies
 * non-admins, the list endpoint returns summaries, the detail endpoint
 * returns the full record (404 on a miss), and stats rolls up.
 *
 * Most cases stub the query layer via `mock.module` so the assertions are
 * about routing, not JSONL scanning. The last describe block deliberately does
 * NOT: it writes a real log line and drives the real query module, because the
 * record-to-DTO mappers are only ever reached on that path and a stubbed test
 * cannot see a wrong field name in them.
 */
import { afterEach, beforeEach, describe, expect, it, mock, } from "bun:test";
import { Elysia, } from "elysia";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { setExecLogPath, } from "../../harness/exec-log";
import { buildRunRecord, } from "../../harness/exec-recorder";
import { getRun, listRuns, stats as queryStats, } from "../../harness/query";
import type { HarnessRunRecord, HarnessRunSummary, HarnessStats, } from "../../harness/types";
import { serializeRun, toSummary, } from "../../harness/types";
import { harnessRoutes, } from "./index";

/**
 * Fixtures live under the repo's .tmp/, matching src/harness/query.test.ts:
 * the real-path tests below must read a real file inside the project, and a
 * stray system-temp file can never be inspected when a test fails.
 *
 * Resource contract: `TMP_ROOT` is only the shared PARENT. Each test owns a
 * `mkdtempSync(TMP_ROOT, "fixture-")` directory created in `beforeEach` and
 * removed in `afterEach`, so tests never collide on a fixed path and a failed
 * test's leftover cannot poison a sibling. `setExecLogPath` is a process-wide
 * pointer reset to null in `afterEach`. `bun test --parallel=N --isolate`
 * (the repo default) gives each file its own registry, and `mock.module` state
 * never crosses files; within a file the tests are order-independent because
 * every one of them re-establishes the log path and the query overrides itself.
 */
const TMP_ROOT = ".tmp/harness-routes";

/** A representative full record. */
const RECORD: HarnessRunRecord = {
  runId: "run-1",
  ts: "2026-10-03T12:00:00Z",
  runMs: 900,
  task: "generate",
  taskType: "chat",
  model: "gpt-test",
  tools: ["read", "write",],
  toolCount: 2,
  pattern: "agent.edit",
  patternDetail: "two edits",
  result: "error",
  error: "boom",
  toolingGap: "no-edit-tool",
  costUsd: 0.01,
  tokensIn: 200,
  tokensOut: 100,
  branch: "feat-harness",
  pid: 99,
  gitSha: "deadbee",
  msg: null,
  turnId: "turn-1",
};

/** Stats derived from RECORD, so the numbers are checkable by hand. */
const STATS: HarnessStats = {
  totals: { runs: 1, failures: 1, costUsd: 0.01, tokensIn: 200, tokensOut: 100, avgMs: 900, },
  byModel: [
    { model: "gpt-test", runs: 1, failures: 1, avgMs: 900, costUsd: 0.01, tokensIn: 200, tokensOut: 100, },
  ],
  byTaskType: [{ taskType: "chat", runs: 1, failures: 1, avgMs: 900, },],
  byPattern: [{ pattern: "agent.edit", runs: 1, failures: 1, },],
  toolingGaps: [{ toolingGap: "no-edit-tool", count: 1, },],
};

/** Mount the routes on a fresh app with a fixed role. */
function app(role: string | null,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "u1", userRole: role, }))
    .use(harnessRoutes(),);

  return built as unknown as Elysia;
}

/** Hit a path on the mounted app. */
function get(role: string | null, path: string,): Promise<Response> {
  return app(role,).handle(new Request(`http://localhost${path}`,),);
}

/**
 * The REAL query functions, captured at import time.
 *
 * `mock.module` in bun is permanent and process-global: it rewrites the module
 * registry, so every later import — including this file's own named imports —
 * resolves to the stub, and `mock.restore()` does not put the original back.
 * Spreading the live `getRun`/`listRuns` here would therefore hand a previous
 * test's stub to the next one. Snapshotting before any `mock.module` call is
 * what lets `withQuery({})` mean "give the route the real reader again", which
 * is the only way the tests below can reach the real record-to-DTO mappers.
 */
const REAL_QUERY = { getRun, listRuns, stats: queryStats, };

/**
 * Point the query module at `overrides` on top of the real functions. Call with
 * no overrides to restore the real reader.
 * @param overrides - the query functions to replace; empty restores the real ones.
 */
function withQuery(overrides: Record<string, unknown>,): void {
  mock.module("../../harness/query", () => ({ ...REAL_QUERY, ...overrides, }),);
}

describe("harnessRoutes", () => {
  describe("authz", () => {
    it("denies a non-admin on every endpoint", async () => {
      for (const path of ["/api/v1/harness/runs", "/api/v1/harness/runs/run-1", "/api/v1/harness/stats",]) {
        expect((await get("user", path,)).status,).toBe(403,);
      }
    });

    it("denies an unauthenticated request", async () => {
      expect((await get(null, "/api/v1/harness/runs",)).status,).toBe(403,);
    });
  });

  describe("GET /api/v1/harness/runs", () => {
    it("returns { items } as summaries, dropping tools and pattern text", async () => {
      withQuery({ listRuns: (): Promise<HarnessRunRecord[]> => Promise.resolve([RECORD,],), },);
      const res = await get("admin", "/api/v1/harness/runs",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { items: HarnessRunSummary[] };
      expect(body.items,).toHaveLength(1,);
      expect(body.items[0],).toEqual(toSummary(RECORD,),);
      expect(body.items[0],).not.toHaveProperty("tools",);
      expect(body.items[0],).not.toHaveProperty("pattern",);
    });

    it("passes limit and both filters through to listRuns", async () => {
      let seen: unknown[] = [];
      withQuery({
        listRuns: (filter: unknown, limit: number,): Promise<HarnessRunRecord[]> => {
          seen = [filter, limit,];
          return Promise.resolve([],);
        },
      },);

      const res = await get("admin", "/api/v1/harness/runs?limit=7&taskType=chat&result=error",);
      expect(res.status,).toBe(200,);
      expect(seen,).toEqual([{ taskType: "chat", result: "error", }, 7,],);
    });

    it("ignores an unknown taskType rather than erroring", async () => {
      withQuery({ listRuns: (): Promise<HarnessRunRecord[]> => Promise.resolve([],), },);
      expect((await get("admin", "/api/v1/harness/runs?taskType=bogus",)).status,).toBe(200,);
    });
  });

  describe("GET /api/v1/harness/runs/:runId", () => {
    it("returns the full record including tools, pattern and toolingGap", async () => {
      withQuery({ getRun: (): Promise<HarnessRunRecord | null> => Promise.resolve(RECORD,), },);
      const res = await get("admin", "/api/v1/harness/runs/run-1",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as Record<string, unknown>;
      expect(body.tools,).toEqual(["read", "write",],);
      expect(body.pattern,).toBe("agent.edit",);
      expect(body.patternDetail,).toBe("two edits",);
      expect(body.toolingGap,).toBe("no-edit-tool",);
    });

    it("returns 404 when the run id is not in the log", async () => {
      withQuery({ getRun: (): Promise<HarnessRunRecord | null> => Promise.resolve(null,), },);
      expect((await get("admin", "/api/v1/harness/runs/missing",)).status,).toBe(404,);
    });
  });

  describe("GET /api/v1/harness/stats", () => {
    it("returns totals, per-model, per-task-type, per-pattern and tooling gaps", async () => {
      withQuery({ stats: (): Promise<HarnessStats> => Promise.resolve(STATS,), },);
      const res = await get("admin", "/api/v1/harness/stats",);
      expect(res.status,).toBe(200,);
      // jsonResponse wraps the payload with a `meta` envelope; assert the rollups.
      const body = await res.json() as HarnessStats & { meta?: unknown };
      expect(body.totals,).toEqual(STATS.totals,);
      expect(body.byModel,).toEqual(STATS.byModel,);
      expect(body.byTaskType,).toEqual(STATS.byTaskType,);
      expect(body.byPattern,).toEqual(STATS.byPattern,);
      expect(body.toolingGaps,).toEqual(STATS.toolingGaps,);
    });
  });

  /**
   * The regression that 115 hand-built unit tests could not catch: both
   * endpoints answered a REAL log line, driven through the real query module
   * and the real mappers.
   *
   * The old detail test stubbed `getRun` and asserted on a hand-written
   * record, so it only ever proved the route echoed its argument. It never
   * asked the endpoint to turn a record into a DTO, which is where the
   * persisted `runMs` leaked out as `runMs` while every consumer read
   * `durationMs` — the TUI rendered `NaNmNaNs` for every run.
   */
  describe("duration field: real record through the real mappers", () => {
    let dir: string;
    let runId: string;

    beforeEach(() => {
      mkdirSync(TMP_ROOT, { recursive: true, },);
      dir = mkdtempSync(join(TMP_ROOT, "fixture-",),);
      const log = join(dir, "executions.jsonl",);
      // Built by the real recorder and written by the real serializer, so the
      // log line is indistinguishable from one the running server produces.
      // No price is declared, which is what makes costUsd null in the record.
      const record = buildRunRecord({
        taskType: "chat",
        model: "gpt-test",
        runMs: 1234,
        result: "ok",
        task: "generate",
        tools: ["read", "write",],
        pattern: "agent.edit",
        patternDetail: "two edits",
      },);

      runId = record.runId;
      writeFileSync(log, `${JSON.stringify(serializeRun(record,),)}\n`, "utf8",);
      setExecLogPath(log,);
      // Hand the route the REAL query functions. `mock.module` is permanent and
      // process-global, so this must come from the import-time snapshot rather
      // than from the live import, which the earlier stubs in this file have
      // already replaced.
      withQuery({},);
    },);

    afterEach(() => {
      setExecLogPath(null,);
      rmSync(dir, { recursive: true, force: true, },);
    },);

    it("serves durationMs as a number and never the stored runMs", async () => {
      const res = await get("admin", `/api/v1/harness/runs/${runId}`,);
      expect(res.status,).toBe(200,);
      const body = await res.json() as Record<string, unknown>;
      expect(body.durationMs,).toBe(1234,);
      expect(typeof body.durationMs,).toBe("number",);
      // The regression itself: this key must not reach the HTTP contract.
      expect(body,).not.toHaveProperty("runMs",);
    });

    it("keeps the detail-only fields the TUI activity view reads", async () => {
      const res = await get("admin", `/api/v1/harness/runs/${runId}`,);
      const body = await res.json() as Record<string, unknown>;
      // Dropping these while renaming the duration would be a second, quieter
      // data loss — the detail view renders all of them.
      expect(body.tools,).toEqual(["read", "write",],);
      expect(body.pattern,).toBe("agent.edit",);
      expect(body.patternDetail,).toBe("two edits",);
      expect(body,).toHaveProperty("toolingGap",);
      expect(body,).toHaveProperty("msg",);
      expect(body,).toHaveProperty("branch",);
      expect(body,).toHaveProperty("gitSha",);
      expect(body,).toHaveProperty("pid",);
    });

    it("agrees with the list endpoint on the duration field name and value", async () => {
      const detail = await (await get("admin", `/api/v1/harness/runs/${runId}`,)).json() as Record<string, unknown>;
      const list = await (await get("admin", "/api/v1/harness/runs",)).json() as {
        items: Record<string, unknown>[];
      };

      const item = list.items[0];
      expect(item,).toBeDefined();
      // Pinned together on purpose: a future change that renames the field on
      // one endpoint only is exactly the bug this file exists to prevent.
      expect(Object.keys(detail,).filter((k,) => k === "durationMs" || k === "runMs"),).toEqual(
        Object.keys(item!,).filter((k,) => k === "durationMs" || k === "runMs"),
      );

      expect(detail.durationMs,).toBe(item!.durationMs,);
      expect(detail,).not.toHaveProperty("runMs",);
      expect(item!,).not.toHaveProperty("runMs",);
    });

    it("coerces an unpriced run's null costUsd to a number on both endpoints", async () => {
      const detail = await (await get("admin", `/api/v1/harness/runs/${runId}`,)).json() as Record<string, unknown>;
      const list = await (await get("admin", "/api/v1/harness/runs",)).json() as {
        items: Record<string, unknown>[];
      };

      // The stored line really does have a null cost: no price was declared.
      // `toSummary` already coalesces it to 0; the detail mapper must not
      // reintroduce the null, or the web `Type.Number()` decode rejects the row
      // and the detail view silently renders nothing.
      expect(typeof detail.costUsd,).toBe("number",);
      expect(detail.costUsd,).toBe(0,);
      expect(detail.costUsd,).toBe(list.items[0]!.costUsd,);
    });
  });
});
