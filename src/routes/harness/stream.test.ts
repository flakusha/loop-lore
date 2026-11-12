// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the harness exec-log/job-status SSE surface: the admin
 * guard denies non-admins and unauthenticated callers, an uncomposed runtime
 * reads 503, a connected admin gets the `jobs` snapshot immediately, a run
 * appended AFTER connect arrives as a `run` frame in runs-summary shape, and
 * history written BEFORE connect is never replayed.
 *
 * Resource contract (parallel-safe): ONE exec-log file per test in its own
 * mkdtemp dir (reset to no-log afterwards), the per-test composed runtime
 * singleton reset around every test, and a 10ms poll beat with a far-off
 * keepalive so beats fire without sleeps; every read is promise-based with a
 * fail-fast timeout, and every reader is cancelled so no timer outlives a
 * test. No ports, no fixed paths — order-independent under the parallel
 * runner.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import { appendExecLog, resetExecLogCounters, resetExecLogPath, setExecLogPath, } from "../../harness/exec-log";
import { buildRunRecord, } from "../../harness/exec-recorder";
import { fakeFactory, } from "../../integrations/harness/fakes";
import { getHarnessRuntime, initHarnessRuntime, resetHarnessRuntime, } from "../../integrations/harness/runtime";
import { harnessStreamRoutes, openHarnessStream, } from "./stream";

let dir: string;

beforeEach(() => {
  resetHarnessRuntime();
  resetExecLogCounters();
  resetExecLogPath();
  dir = mkdtempSync(join(tmpdir(), "harness-stream-",),);
  setExecLogPath(join(dir, "executions.jsonl",),);
},);

afterEach(() => {
  resetHarnessRuntime();
  resetExecLogCounters();
  setExecLogPath(null,);
  resetExecLogPath();
  rmSync(dir, { recursive: true, force: true, },);
},);

/** Mount the routes on a fresh app with a fixed role and fast test beats. */
function app(role: string | null,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "u1", userRole: role, }))
    .use(harnessStreamRoutes("/api/v1", { intervalMs: 10, keepaliveMs: 60_000, },),);

  return built as unknown as Elysia;
}

/** Hit a path on a fresh mounted app. */
function hit(role: string | null, path: string,): Promise<Response> {
  return app(role,).handle(new Request(`http://localhost${path}`,),);
}

const LIVE: AcpProfileConfig = {
  name: "p",
  command: ["fake", "p",],
  tiers: { fast: { model: "zai/glm-4.6", capabilities: ["tools",], }, },
};

/** Compose a runtime with one configured profile. */
function composeRuntime(): void {
  const { factory, } = fakeFactory({ p: { models: ["zai/glm-4.6",], }, },);
  initHarnessRuntime({ enabled: true, profiles: [LIVE,], }, factory,);
}

/** One finished dispatch through the real recorder, appended to the test log. */
function dispatch(task: string,): string {
  const record = buildRunRecord({ taskType: "chat", model: "m", runMs: 1, result: "ok", profile: "p", task, },);
  appendExecLog(record,);
  return record.runId;
}

/** Read the next SSE chunk, failing fast if nothing arrives in time. */
async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>, ms = 500,): Promise<string> {
  const timeout = new Promise<undefined>((resolve,) => {
    setTimeout(() => resolve(undefined,), ms,);
  },);

  const result = await Promise.race([reader.read(), timeout,],);
  expect(result,).toBeDefined();
  expect((result as { done: boolean }).done,).toBe(false,);
  return new TextDecoder().decode((result as { value: Uint8Array }).value,);
}

describe("harnessStreamRoutes", () => {
  it("denies a non-admin", async () => {
    composeRuntime();

    const res = await hit("member", "/api/v1/harness/stream",);
    expect(res.status,).toBe(403,);
  });

  it("denies an unauthenticated caller", async () => {
    composeRuntime();

    const res = await hit(null, "/api/v1/harness/stream",);
    expect(res.status,).toBe(403,);
  });

  it("reads 503 when the runtime is not composed", async () => {
    const res = await hit("admin", "/api/v1/harness/stream",);
    expect(res.status,).toBe(503,);
  });

  it("a disabled config composes no runtime, so the surface stays inert", async () => {
    initHarnessRuntime({ enabled: false, profiles: [], },);

    const res = await hit("admin", "/api/v1/harness/stream",);
    expect(res.status,).toBe(503,);
  });

  it("opens with the jobs snapshot and never replays pre-connect history", async () => {
    composeRuntime();
    dispatch("pre-connect",);

    const res = await hit("admin", "/api/v1/harness/stream",);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("text/event-stream",);
    expect(res.headers.get("cache-control",),).toBe("no-cache",);

    const reader = res.body?.getReader();
    expect(reader,).toBeDefined();
    // The FIRST frame is the jobs snapshot — a history replay would have
    // delivered the pre-connect run instead.
    const first = await readChunk(reader!,);
    expect(first,).toContain("event: jobs",);
    expect(first,).not.toContain("event: run",);
    expect(first,).not.toContain("pre-connect",);

    await reader!.cancel();
  });

  it("delivers a post-connect run as a runs-summary frame", async () => {
    composeRuntime();

    const res = await hit("admin", "/api/v1/harness/stream",);
    const reader = res.body?.getReader();
    expect(reader,).toBeDefined();
    await readChunk(reader!,); // initial jobs snapshot

    const runId = dispatch("post-connect",);
    let tail = "";
    for (let i = 0; i < 3 && !tail.includes(`"runId":"${runId}"`,); i++) {
      tail += await readChunk(reader!,);
    }

    expect(tail,).toContain("event: run",);
    expect(tail,).toContain(`"runId":"${runId}"`,);
    // Summary shape, not detail: the fields /harness/runs serves.
    expect(tail,).toContain('"taskType":"chat"',);
    expect(tail,).toContain('"profile":"p"',);

    await reader!.cancel();
  });

  it("surfaces pending permission asks as job frames", async () => {
    composeRuntime();

    const res = await hit("admin", "/api/v1/harness/stream",);
    const reader = res.body?.getReader();
    expect(reader,).toBeDefined();

    const pending = getHarnessRuntime()?.permissions.submit({
      profile: "p",
      // An edit ask outside the auto-allow policy parks for a human —
      // the same fixture permission-queue.test.ts uses.
      pending: { params: { sessionId: "s", kind: "edit", }, kind: "edit", },
      sandboxRoot: dir,
    },);

    await pending;

    let tail = "";
    for (let i = 0; i < 3 && !tail.includes("event: jobs",); i++) {
      tail += await readChunk(reader!,);
    }

    expect(tail,).toContain("event: jobs",);
    expect(tail,).toContain('"profile":"p"',);

    await reader!.cancel();
  });
});

describe("openHarnessStream", () => {
  it("serves the same SSE surface directly as the route does", async () => {
    composeRuntime();

    const res = openHarnessStream({ intervalMs: 10, keepaliveMs: 60_000, },);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("text/event-stream",);

    const reader = res.body?.getReader();
    expect(reader,).toBeDefined();
    // Anchor + immediate jobs snapshot, exactly like the route path.
    const first = await readChunk(reader!,);
    expect(first,).toContain("event: jobs",);

    const runId = dispatch("direct-open",);
    let tail = "";
    for (let i = 0; i < 3 && !tail.includes(`"runId":"${runId}"`,); i++) {
      tail += await readChunk(reader!,);
    }

    expect(tail,).toContain("event: run",);
    expect(tail,).toContain(`"runId":"${runId}"`,);

    await reader!.cancel();
  });
});
