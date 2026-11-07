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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import type { HarnessAcpConfig, } from "../../config/schema/harness";
import type { DB, } from "../../db/schema";
import { setExecLogPath, } from "../../harness/exec-log";
import { buildRunRecord, } from "../../harness/exec-recorder";
import * as realQuery from "../../harness/query";
import type {
  HarnessResult,
  HarnessRunRecord,
  HarnessRunSummary,
  HarnessStats,
  HarnessTaskType,
} from "../../harness/types";
import { serializeRun, toSummary, } from "../../harness/types";
import { initHarnessAdminSettings, resetHarnessAdminSettings, } from "../../integrations/harness/admin-settings";
import * as realAvailability from "../../integrations/harness/availability";
import { getHarnessRuntime, initHarnessRuntime, resetHarnessRuntime, } from "../../integrations/harness/runtime";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
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

/**
 * Command name guaranteed absent on any development machine, so the
 * availability verdicts below are deterministic (`available: false`).
 */
const MISSING_BINARY = "loop-lore-no-such-binary";

/** Shared settings-store fixture: the config the admin settings tests read. */
const SETTINGS_FIXTURE: HarnessAcpConfig = {
  enabled: false,
  profiles: [
    {
      name: "omp-main",
      command: [MISSING_BINARY, "acp",],
      tiers: { good: { model: "test-provider/test-model", capabilities: ["tools",], }, },
    },
    {
      name: "codex-sub",
      command: [MISSING_BINARY, "--acp",],
      harness: "codex",
      tiers: { good: { model: "test-provider/test-model", capabilities: ["tools",], }, },
    },
  ],
};

let db: Kysely<DB>;
let dbFixture: TestDb;

beforeAll(async () => {
  dbFixture = await createTestDb();
  db = dbFixture.db;
},);

afterAll(async () => {
  await destroyTestDb(dbFixture,);
},);

/** Mount the routes on a fresh app with a fixed role (read-only endpoints need no database). */
function app(role: string | null,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "u1", userRole: role, }))
    .use(harnessRoutes({ database: db, },),);

  return built as unknown as Elysia;
}

/** Hit a path on the mounted app. */
function get(role: string | null, path: string,): Promise<Response> {
  return app(role,).handle(new Request(`http://localhost${path}`,),);
}

/** Hit a path with a JSON body on the mounted app. */
function send(role: string | null, path: string, body: unknown, method = "PUT",): Promise<Response> {
  return app(role,).handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/**
 * The REAL query module, captured at import time as a plain value snapshot.
 *
 * `mock.module` in bun is permanent and process-global: it rewrites the module
 * registry, so every later import — including this file's own named imports —
 * resolves to the stub, and `mock.restore()` does not put the original back.
 * Snapshotting before any `mock.module` call is what lets `withQuery({})`
 * mean "give the route the real reader again", which is the only way the
 * tests below can reach the real record-to-DTO mappers. The snapshot covers
 * the FULL namespace, so the restore in the file-level `afterEach` also keeps
 * non-endpoint exports (`MAX_LINES`, `DEFAULT_LIMIT`, …) real for later
 * importers in a non-isolated run.
 */
const REAL_QUERY: Record<string, unknown> = { ...realQuery, };

/**
 * Point the query module at `overrides` on top of the real functions. Call with
 * no overrides to restore the real reader.
 * @param overrides - the query functions to replace; empty restores the real ones.
 */
function withQuery(overrides: Record<string, unknown>,): void {
  mock.module("../../harness/query", () => ({ ...REAL_QUERY, ...overrides, }),);
}

/**
 * The REAL availability module, captured at import time as a plain value
 * snapshot — same mechanism as REAL_QUERY above. Tests that assert the
 * available:true wire path stub `probeHarnessCommand` (a real probe would
 * depend on the host's installed binaries); `withAvailability({})` restores
 * the real module.
 */
const REAL_AVAILABILITY: Record<string, unknown> = { ...realAvailability, };

/**
 * Point the availability module at `overrides` on top of the real exports.
 * Call with no overrides to restore the real probe.
 * @param overrides - the availability functions to replace; empty restores the real ones.
 */
function withAvailability(overrides: Record<string, unknown>,): void {
  mock.module("../../integrations/harness/availability", () => ({ ...REAL_AVAILABILITY, ...overrides, }),);
}

afterEach(() => {
  // A stub left installed outlives this file: mock.module is process-global,
  // so every later file of a non-isolated run would import it (see the
  // mirror-image restore in files.test.ts).
  mock.module("../../harness/query", () => REAL_QUERY,);
  mock.module("../../integrations/harness/availability", () => REAL_AVAILABILITY,);
},);

describe("harnessRoutes", () => {
  describe("authz", () => {
    it("denies a non-admin on every endpoint", async () => {
      for (
        const path of [
          "/api/v1/harness/runs",
          "/api/v1/harness/runs/run-1",
          "/api/v1/harness/stats",
          "/api/v1/harness/settings",
        ]
      ) {
        expect((await get("user", path,)).status,).toBe(403,);
      }
    });

    it("denies an unauthenticated request", async () => {
      expect((await get(null, "/api/v1/harness/runs",)).status,).toBe(403,);
    });
  });

  describe("GET /api/v1/harness/settings", () => {
    afterEach(() => resetHarnessAdminSettings());

    it("returns enabled state and profiles decorated with the provider ToS matrix", async () => {
      initHarnessAdminSettings({
        enabled: true,
        profiles: [
          { name: "omp-main", command: [MISSING_BINARY,], tiers: {}, },
          {
            name: "cc-sub",
            command: [MISSING_BINARY,],
            tiers: {},
            harness: "claude-code",
            tosGrayzoneAcknowledged: true,
          },
        ],
      },);

      const res = await get("admin", "/api/v1/harness/settings",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as {
        enabled: boolean;
        profiles: Array<
          {
            name: string;
            flavor: string;
            usageClasses: string[];
            subscriptionBacked: boolean;
            noteKey: string;
            tosGrayzoneAcknowledged: boolean;
            availability: { available: boolean; reason?: string };
          }
        >;
      };

      expect(body.enabled,).toBe(true,);
      expect(body.profiles,).toHaveLength(2,);
      expect(body.profiles[0],).toEqual({
        name: "omp-main",
        flavor: "omp",
        usageClasses: ["api", "local",],
        subscriptionBacked: false,
        noteKey: "harness.tos.note.omp",
        tosGrayzoneAcknowledged: false,
        availability: { available: false, reason: `"${MISSING_BINARY}" not found on PATH`, },
      },);

      expect(body.profiles[1]?.flavor,).toBe("claude-code",);
      expect(body.profiles[1]?.subscriptionBacked,).toBe(true,);
      expect(body.profiles[1]?.usageClasses,).toContain("subscription-backed",);
      expect(body.profiles[1]?.tosGrayzoneAcknowledged,).toBe(true,);
    });

    it("serves the boot-composed runtime's own config snapshot unchanged", async () => {
      const acp: HarnessAcpConfig = {
        enabled: true,
        profiles: [{ name: "omp-main", command: [MISSING_BINARY,], tiers: {}, },],
      };

      // The boot pairing: the store's file layer and the outbound runtime
      // compose from ONE snapshot, so the settings surface and the dispatch
      // stack can never disagree about the configured profiles.
      initHarnessAdminSettings(acp,);
      initHarnessRuntime(acp,);
      try {
        const res = await get("admin", "/api/v1/harness/settings",);
        expect(res.status,).toBe(200,);
        const body = await res.json() as { enabled: boolean; profiles: Array<{ name: string }> };
        expect(body.enabled,).toBe(true,);
        expect(body.profiles.map((p,) => p.name),).toEqual(["omp-main",],);

        // The routes and the runtime see the same composed singleton and the
        // same snapshot the store was seeded from.
        expect(getHarnessRuntime(),).toBe(getHarnessRuntime(),);
        expect(getHarnessRuntime()?.acp,).toBe(acp,);
      } finally {
        resetHarnessRuntime();
      }
    });

    it("reads the code defaults when the store was never seeded", async () => {
      const res = await get("admin", "/api/v1/harness/settings",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { enabled: boolean; profiles: unknown[] };
      expect(body.enabled,).toBe(false,);
      expect(body.profiles,).toEqual([],);
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

  /**
   * The runs filter, driven through REAL log lines: the task-type vocabulary
   * the admin panel sends (`harnessCode`) is only meaningful if the boundary
   * accepts it, and a value it does not know must be a rejection, not a
   * silently dropped filter that returns every row.
   */
  describe("GET /api/v1/harness/runs: filter contract on real log rows", () => {
    let dir: string;

    beforeEach(() => {
      mkdirSync(TMP_ROOT, { recursive: true, },);
      dir = mkdtempSync(join(TMP_ROOT, "fixture-",),);
      const log = join(dir, "executions.jsonl",);
      // Three real rows: a chat run, a harnessCode run and a chat run that
      // timed out. Written by the real serializer, so the lines are
      // indistinguishable from the ones the running server produces.
      const rows: Array<{ runId: string; taskType: HarnessTaskType; result: HarnessResult }> = [
        { runId: "run-chat", taskType: "chat", result: "ok", },
        { runId: "run-code", taskType: "harnessCode", result: "ok", },
        { runId: "run-timeout", taskType: "chat", result: "timeout", },
      ];

      const lines = rows.map((row,) => {
        const record = buildRunRecord({
          taskType: row.taskType,
          model: "gpt-test",
          runMs: 100,
          result: row.result,
          task: "generate",
          tools: ["read",],
        },);

        return JSON.stringify(serializeRun({ ...record, runId: row.runId, },),);
      },);

      writeFileSync(log, lines.join("\n",) + "\n", "utf8",);
      setExecLogPath(log,);
      // The REAL query functions — `mock.module` is permanent and
      // process-global, so this comes from the import-time snapshot.
      withQuery({},);
    },);

    afterEach(() => {
      setExecLogPath(null,);
      rmSync(dir, { recursive: true, force: true, },);
    },);

    it("returns only the rows whose task type matches the panel's vocabulary", async () => {
      const res = await get("admin", "/api/v1/harness/runs?taskType=harnessCode",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { items: HarnessRunSummary[] };
      expect(body.items.map((i,) => i.runId),).toEqual(["run-code",],);
      // The wire coercion must not flatten the value to "other" either.
      expect(body.items[0]?.taskType,).toBe("harnessCode",);
    });

    it("still filters on the server's own vocabulary", async () => {
      const res = await get("admin", "/api/v1/harness/runs?taskType=chat",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { items: HarnessRunSummary[] };
      expect(body.items.map((i,) => i.runId),).toEqual(["run-timeout", "run-chat",],);
    });

    it("rejects an unknown task type instead of dropping the filter", async () => {
      // Status only: the bare route test app does not mount the app-level
      // `onValidationError`, so the body is Elysia's default, not the app
      // envelope.
      expect((await get("admin", "/api/v1/harness/runs?taskType=bogus",)).status,).toBe(422,);
    });

    it("returns only the timeout rows for ?result=timeout", async () => {
      const res = await get("admin", "/api/v1/harness/runs?result=timeout",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as { items: HarnessRunSummary[] };
      expect(body.items.map((i,) => i.runId),).toEqual(["run-timeout",],);
    });
  });

  describe("GET /api/v1/harness/settings", () => {
    it("decorates each configured profile with usage class + note per flavor", async () => {
      resetHarnessAdminSettings();
      initHarnessAdminSettings(SETTINGS_FIXTURE,);

      const res = await get("admin", "/api/v1/harness/settings",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as {
        enabled: boolean;
        profiles: {
          name: string;
          flavor: string;
          usageClasses: string[];
          subscriptionBacked: boolean;
          tosGrayzoneAcknowledged: boolean;
        }[];
      };

      expect(body.enabled,).toBe(false,);
      const codex = body.profiles.find((p,) => p.name === "codex-sub")!;
      expect(codex.flavor,).toBe("codex",);
      expect(codex.usageClasses,).toContain("subscription-backed",);
      expect(codex.subscriptionBacked,).toBe(true,);
      expect(codex.tosGrayzoneAcknowledged,).toBe(false,);

      const omp = body.profiles.find((p,) => p.name === "omp-main")!;
      expect(omp.subscriptionBacked,).toBe(false,);
      expect(omp.usageClasses,).toContain("local",);
    });

    it("decorates every profile with a lazily probed availability verdict", async () => {
      resetHarnessAdminSettings();
      initHarnessAdminSettings(SETTINGS_FIXTURE,);

      // The fixture commands point at a name that cannot exist, so the
      // verdict is deterministic: unavailable, with the probe's reason.
      const res = await get("admin", "/api/v1/harness/settings",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as {
        profiles: { name: string; availability: { available: boolean; reason: string } }[];
      };

      expect(body.profiles,).toHaveLength(2,);
      for (const profile of body.profiles) {
        expect(profile.availability.available,).toBe(false,);
        expect(profile.availability.reason,).toContain(MISSING_BINARY,);
      }
    });

    it("surfaces an available verdict with the probed version when the binary exists", async () => {
      // A real probe would depend on the host's installed binaries, so the
      // wire path for available:true is asserted against the stubbed probe.
      withAvailability({
        probeHarnessCommand: () => Promise.resolve({ available: true, version: "opencode 9.9.9", },),
      },);

      resetHarnessAdminSettings();
      initHarnessAdminSettings(SETTINGS_FIXTURE,);

      const res = await get("admin", "/api/v1/harness/settings",);
      expect(res.status,).toBe(200,);
      const body = await res.json() as {
        profiles: { availability: { available: boolean; version: string | null } }[];
      };

      expect(body.profiles,).toHaveLength(2,);
      for (const profile of body.profiles) {
        expect(profile.availability,).toEqual({ available: true, version: "opencode 9.9.9", },);
      }
    });

    it("answers the error envelope when a profile carries an unknown harness flavor", async () => {
      // The typed config forbids an unknown flavor, and the config validator
      // only checks flavors while `harness.acp.enabled` is true — so a
      // DISABLED config with a typo'd flavor reaches the store unchallenged.
      // The cast injects exactly that state; the wire decoration then throws
      // and the route must answer the envelope, not a raw-text 500.
      resetHarnessAdminSettings();
      initHarnessAdminSettings({
        enabled: false,
        profiles: [
          {
            name: "typo-profile",
            command: [MISSING_BINARY, "acp",],
            harness: "bedrock",
            tiers: { good: { model: "test-provider/test-model", capabilities: ["tools",], }, },
          },
        ],
      } as unknown as HarnessAcpConfig,);

      const res = await get("admin", "/api/v1/harness/settings",);
      expect(res.status,).toBe(500,);
      const body = await res.json() as { error: string; code: string };
      expect(body.code,).toBe("SERVER_ERROR",);
      // The operator gets the flavor to fix, and nothing else.
      expect(body.error,).toContain("bedrock",);
      expect(body.error,).not.toContain("no provider ToS metadata",);
    });

    it("denies a non-admin and an unauthenticated caller ahead of the flavor error path", async () => {
      // The error path above reads the admin's own config to name the offending
      // flavor, so the authorization boundary has to hold AHEAD of it: an
      // unauthorized caller gets the 403 and never the 500 that leaks the
      // flavor. The guard is a beforeHandle on the whole router, so the denial
      // happens before the handler body runs at all.
      resetHarnessAdminSettings();
      initHarnessAdminSettings({
        enabled: false,
        profiles: [
          {
            name: "typo-profile",
            command: [MISSING_BINARY, "acp",],
            harness: "bedrock",
            tiers: { good: { model: "test-provider/test-model", capabilities: ["tools",], }, },
          },
        ],
      } as unknown as HarnessAcpConfig,);

      for (const role of ["user", null,]) {
        const res = await get(role, "/api/v1/harness/settings",);
        expect(res.status,).toBe(403,);
        expect(await res.text(),).not.toContain("bedrock",);
      }
    });
  });

  describe("PUT /api/v1/harness/settings", () => {
    it("denies a non-admin and an unauthenticated caller", async () => {
      expect((await send("user", "/api/v1/harness/settings", { enabled: true, },)).status,).toBe(403,);
      expect((await send(null, "/api/v1/harness/settings", { enabled: true, },)).status,).toBe(403,);
    });

    it("round-trips an acknowledgement through the save path and persists it", async () => {
      resetHarnessAdminSettings();
      initHarnessAdminSettings(SETTINGS_FIXTURE,);

      const res = await send("admin", "/api/v1/harness/settings", { acknowledgements: { "codex-sub": true, }, },);
      expect(res.status,).toBe(200,);
      const body = await res.json() as {
        enabled: boolean;
        profiles: { name: string; tosGrayzoneAcknowledged: boolean; availability: { available: boolean } }[];
      };

      expect(body.profiles.find((p,) => p.name === "codex-sub")?.tosGrayzoneAcknowledged,).toBe(true,);

      // The save response is the same wire shape, availability included.
      expect(body.profiles.every((p,) => p.availability.available === false),).toBe(true,);

      const stored = await db.selectFrom("system_config",).select("value",).where(
        "key",
        "=",
        "harness.acp.tos_acknowledgements",
      ).executeTakeFirst();

      expect(stored?.value,).toBe(JSON.stringify({ "codex-sub": true, },),);
    });

    it("a declining client that sends nothing leaves the flag unset and the toggle off", async () => {
      resetHarnessAdminSettings();
      initHarnessAdminSettings(SETTINGS_FIXTURE,);

      const res = await get("admin", "/api/v1/harness/settings",);
      const body = await res.json() as { enabled: boolean; profiles: { tosGrayzoneAcknowledged: boolean }[] };
      expect(body.enabled,).toBe(false,);
      expect(body.profiles.every((p,) => p.tosGrayzoneAcknowledged === false),).toBe(true,);
    });

    it("rejects a malformed acknowledgement patch without persisting", async () => {
      resetHarnessAdminSettings();
      initHarnessAdminSettings(SETTINGS_FIXTURE,);
      await db.deleteFrom("system_config",).where("key", "=", "harness.acp.tos_acknowledgements",).execute();

      // Typebox rejects the non-boolean value before the handler runs.
      const bad = await send("admin", "/api/v1/harness/settings", { acknowledgements: { "codex-sub": "yes", }, },);
      expect(bad.status,).toBe(422,);

      // The handler maps a validator rejection (unknown profile) to 400.
      const unknown = await send("admin", "/api/v1/harness/settings", {
        acknowledgements: { "no-such-profile": true, },
      },);

      expect(unknown.status,).toBe(400,);

      const stored = await db.selectFrom("system_config",).select("value",).where(
        "key",
        "=",
        "harness.acp.tos_acknowledgements",
      ).executeTakeFirst();

      expect(stored,).toBeUndefined();
    });
  });
});
