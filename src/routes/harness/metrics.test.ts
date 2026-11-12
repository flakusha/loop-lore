// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for the admin harness metrics surface: the admin guard denies
 * non-admins and unauthenticated callers WITHOUT leaking any metric text, an
 * uncomposed runtime reads 503 (inert when the integration is disabled), and
 * a composed runtime serves the SHARED harness families plus the scoped ones
 * — dispatch counters by exec-log task type and by profile, the quota reset
 * surface, the configured flavor, and the cached binary availability — all in
 * parseable exposition shape.
 *
 * Resource contract (parallel-safe): the runtime is the per-test composed
 * singleton, reset in beforeEach AND afterEach via resetHarnessRuntime; the
 * exec-log counters and log path are reset per test so the process-lifetime
 * counters start at zero and nothing ever touches the real worktree log; no
 * ports, no sleeps, no fixed paths.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import { appendExecLog, resetExecLogCounters, resetExecLogPath, } from "../../harness/exec-log";
import { buildRunRecord, } from "../../harness/exec-recorder";
import { fakeFactory, } from "../../integrations/harness/fakes";
import { getHarnessRuntime, initHarnessRuntime, resetHarnessRuntime, } from "../../integrations/harness/runtime";
import {
  harnessMetricsRoutes,
  harnessScopedFamilies,
  renderHarnessMetrics,
} from "./metrics";
import { PROM_TEXT_MIME, } from "./prometheus";

beforeEach(() => {
  resetHarnessRuntime();
  resetExecLogCounters();
  resetExecLogPath();
},);

afterEach(() => {
  resetHarnessRuntime();
  resetExecLogCounters();
  resetExecLogPath();
},);

/** Mount the routes on a fresh app with a fixed role. */
function app(role: string | null,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "u1", userRole: role, }))
    .use(harnessMetricsRoutes(),);

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

/** One finished dispatch through the real recorder, counted by the writer. */
function dispatch(taskType: "chat" | "aux", profile: string | null,): void {
  appendExecLog(buildRunRecord({ taskType, model: "m", runMs: 1, result: "ok", profile, },),);
}

describe("harnessMetricsRoutes", () => {
  it("denies a non-admin without leaking metric text", async () => {
    composeRuntime();

    const res = await hit("member", "/api/v1/harness/metrics",);
    expect(res.status,).toBe(403,);
    expect(await res.text(),).not.toContain("loop_lore_harness_",);
  });

  it("denies an unauthenticated caller without leaking metric text", async () => {
    composeRuntime();

    const res = await hit(null, "/api/v1/harness/metrics",);
    expect(res.status,).toBe(403,);
    expect(await res.text(),).not.toContain("loop_lore_harness_",);
  });

  it("reads 503 when the runtime is not composed", async () => {
    const res = await hit("admin", "/api/v1/harness/metrics",);
    expect(res.status,).toBe(503,);
  });

  it("a disabled config composes no runtime, so the surface stays inert", async () => {
    initHarnessRuntime({ enabled: false, profiles: [], },);

    const res = await hit("admin", "/api/v1/harness/metrics",);
    expect(res.status,).toBe(503,);
  });

  it("serves the shared families plus the scoped ones", async () => {
    composeRuntime();
    dispatch("chat", "p",);
    dispatch("aux", null,);

    const res = await hit("admin", "/api/v1/harness/metrics",);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",) ?? "",).toContain("text/plain",);

    const text = await res.text();
    // Shared block: the same families the opt-in /metrics scrape renders.
    expect(text,).toContain("loop_lore_harness_runs_total",);
    expect(text,).toContain("loop_lore_harness_errors_by_kind_total",);
    expect(text,).toContain('loop_lore_harness_breaker_trips_total{profile="p"}',);
    expect(text,).toContain('loop_lore_harness_profile_rpm{profile="p"}',);
    // Scoped: dispatch counters by task type and by profile (lifetime).
    expect(text,).toContain('loop_lore_harness_dispatch_total{task_type="chat"} 1',);
    expect(text,).toContain('loop_lore_harness_dispatch_total{task_type="aux"} 1',);
    expect(text,).toContain('loop_lore_harness_profile_dispatch_total{profile="p"} 1',);
    // Scoped: flavor identity off the composed config (default omp).
    expect(text,).toContain('loop_lore_harness_profile_info{profile="p",flavor="omp"} 1',);
    // Scoped: quota (0 = no reported reset) and adapter liveness gauges.
    expect(text,).toContain('loop_lore_harness_profile_quota_reset_epoch_seconds{profile="p"} 0',);
    expect(text,).toContain('loop_lore_harness_profile_available{profile="p"}',);
  });

  it("surfaces an externally reported quota reset in unix seconds", async () => {
    composeRuntime();
    getHarnessRuntime()?.ledger.applyUsageReports("p", [
      { providerId: "zai", status: "exhausted", remainingFraction: 0, resetsAt: "2030-01-01T00:00:00Z", },
    ],);

    const res = await hit("admin", "/api/v1/harness/metrics",);
    const text = await res.text();
    expect(text,).toContain('loop_lore_harness_profile_quota_reset_epoch_seconds{profile="p"} 1893456000',);
  });

  it("keeps every harness family in parseable exposition shape", async () => {
    composeRuntime();
    dispatch("chat", "p",);

    const text = await hit("admin", "/api/v1/harness/metrics",).then((res,) => res.text());
    const families = text.split("\n# HELP ",).filter((s,) => s.includes("loop_lore_harness_",));
    expect(families.length,).toBeGreaterThan(5,);
    for (const fam of families) {
      const block = fam.startsWith("# HELP ",) ? fam : "# HELP " + fam;
      const lines = block.split("\n",).filter((l,) => l.length > 0);
      expect(lines[0],).toStartWith("# HELP",);
      expect(lines[1],).toStartWith("# TYPE",);
      for (const line of lines.slice(2,)) {
        const value = line.split(/\s+/,)[1] ?? "";
        expect(Number.isNaN(Number(value,),),).toBe(false,);
      }
    }
  });
});

describe("harnessScopedFamilies", () => {
  it("renders nothing when the runtime is not composed", async () => {
    expect(await harnessScopedFamilies(),).toBe("",);
  });

  it("renders only the admin-scoped families, never the shared scrape families", async () => {
    composeRuntime();
    dispatch("chat", "p",);

    const text = await harnessScopedFamilies();
    // Scoped: dispatch counters by exec-log task type and by profile (lifetime).
    expect(text,).toContain('loop_lore_harness_dispatch_total{task_type="chat"} 1\n',);
    expect(text,).toContain('loop_lore_harness_profile_dispatch_total{profile="p"} 1\n',);
    // Scoped: quota reset surface, configured flavor, cached availability probe.
    expect(text,).toContain('loop_lore_harness_profile_quota_reset_epoch_seconds{profile="p"} 0\n',);
    expect(text,).toContain('loop_lore_harness_profile_info{profile="p",flavor="omp"} 1\n',);
    expect(text,).toContain('loop_lore_harness_profile_available{profile="p"}',);
    // The shared families stay OUT: they belong to the shared block only.
    for (
      const shared of [
        "loop_lore_harness_runs_total",
        "loop_lore_harness_errors_total",
        "loop_lore_harness_spend_usd_total",
        "loop_lore_harness_errors_by_kind_total",
        "loop_lore_harness_breaker_open_profiles",
        "loop_lore_harness_breaker_trips_total",
        "loop_lore_harness_profile_rpm",
        "loop_lore_harness_profile_tokens_per_day",
        "loop_lore_harness_profile_breaker_open",
      ]
    ) {
      expect(text,).not.toContain(shared,);
    }
  });

  it("keeps the lifetime by-profile count of a profile that left the config", async () => {
    composeRuntime();
    dispatch("aux", "ghost",);

    const text = await harnessScopedFamilies();
    expect(text,).toContain('loop_lore_harness_profile_dispatch_total{profile="ghost"} 1\n',);
  });
});

describe("renderHarnessMetrics", () => {
  it("renders the shared block first, then the scoped families", async () => {
    composeRuntime();
    dispatch("chat", "p",);

    const text = await renderHarnessMetrics();
    expect(text,).toStartWith("# HELP loop_lore_harness_runs_total",);
    // Shared block content...
    expect(text,).toContain("loop_lore_harness_runs_total 1\n",);
    expect(text,).toContain('loop_lore_harness_profile_rpm{profile="p"}',);
    // ...followed by the scoped content.
    expect(text,).toContain('loop_lore_harness_dispatch_total{task_type="chat"} 1\n',);
    expect(text.indexOf("loop_lore_harness_runs_total",),).toBeLessThan(
      text.indexOf("loop_lore_harness_dispatch_total",),
    );
  });

  it("the route serves the render under the Prometheus exposition content type", async () => {
    composeRuntime();
    dispatch("chat", "p",);

    const res = await hit("admin", "/api/v1/harness/metrics",);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toBe(PROM_TEXT_MIME,);
    expect(await res.text(),).toBe(await renderHarnessMetrics(),);
  });
});
