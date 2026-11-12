// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the shared Prometheus rendering (routes/harness/prometheus.ts):
 * real rendered exposition output — the exact counter/gauge family shape,
 * the label-value escape rule, the labelled sample lines, and the
 * exposition MIME string — plus the shared harness block: empty when no
 * runtime is composed, zeroed families for a fresh runtime, and the
 * run/error/spend counters folded in off the exec-log writer.
 *
 * Resource contract (parallel-safe): the runtime, exec-log counters, and log
 * path are reset in beforeEach AND afterEach via the module seams; the block
 * reads process-local writer counters only, so nothing touches the real
 * worktree log; no ports, no sleeps, no fixed paths.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { AcpProfileConfig, } from "../../config/schema/harness";
import { appendExecLog, resetExecLogCounters, resetExecLogPath, } from "../../harness/exec-log";
import { buildRunRecord, type ExecRunInput, } from "../../harness/exec-recorder";
import { fakeFactory, } from "../../integrations/harness/fakes";
import { initHarnessRuntime, resetHarnessRuntime, } from "../../integrations/harness/runtime";
import { counter, gauge, harnessSharedBlock, labelledFamily, labelValue, PROM_TEXT_MIME, } from "./prometheus";

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
function dispatch(overrides: Partial<ExecRunInput> = {},): void {
  appendExecLog(
    buildRunRecord({ taskType: "chat", model: "m", runMs: 1, result: "ok", profile: "p", ...overrides, },),
  );
}

describe("PROM_TEXT_MIME", () => {
  it("is the version-0.0.4 Prometheus exposition content type", () => {
    expect(PROM_TEXT_MIME,).toBe("text/plain; version=0.0.4; charset=utf-8",);
  });
});

describe("gauge", () => {
  it("renders HELP + TYPE + one value line", () => {
    expect(gauge("g", 1.5, "help text",),).toBe("# HELP g help text\n# TYPE g gauge\ng 1.5\n",);
  });
});

describe("counter", () => {
  it("renders HELP + TYPE + one value line with the counter type", () => {
    expect(counter("c", 7, "help text",),).toBe("# HELP c help text\n# TYPE c counter\nc 7\n",);
  });

  it("renders a zero sample as 0, not an empty or absent line", () => {
    expect(counter("c", 0, "help text",),).toBe("# HELP c help text\n# TYPE c counter\nc 0\n",);
  });
});

describe("labelValue", () => {
  it("keeps the readable identifier set as-is", () => {
    expect(labelValue("p_1.2-alpha",),).toBe("p_1.2-alpha",);
  });

  it("replaces whitespace that would split the sample line", () => {
    expect(labelValue("my profile",),).toBe("my_profile",);
  });

  it("replaces every character outside the safe set with _", () => {
    expect(labelValue("a:b/c+d",),).toBe("a_b_c_d",);
    expect(labelValue("Pr0f!le@#1",),).toBe("Pr0f_le__1",);
  });
});

describe("labelledFamily", () => {
  it("renders HELP + TYPE + one sample line per entry, in order", () => {
    expect(
      labelledFamily("f_total", "help text", "counter", "result", [["error", 1,], ["timeout", 2,],],),
    ).toBe(
      '# HELP f_total help text\n# TYPE f_total counter\nf_total{result="error"} 1\nf_total{result="timeout"} 2\n',
    );
  });

  it("renders the requested metric type in the TYPE header", () => {
    expect(labelledFamily("f", "help text", "gauge", "profile", [["p", 3,],],),).toBe(
      '# HELP f help text\n# TYPE f gauge\nf{profile="p"} 3\n',
    );
  });

  it("renders head-only with no samples", () => {
    expect(labelledFamily("f", "help text", "counter", "profile", [],),).toBe(
      "# HELP f help text\n# TYPE f counter\n",
    );
  });
});

describe("harnessSharedBlock", () => {
  it("renders an empty block when no runtime is composed", () => {
    expect(harnessSharedBlock(),).toBe("",);
  });

  it("renders zeroed families for a fresh composed runtime", () => {
    composeRuntime();

    const block = harnessSharedBlock();
    // Process-lifetime counters off the exec-log writer, all zero pre-dispatch.
    expect(block,).toContain("loop_lore_harness_runs_total 0\n",);
    expect(block,).toContain("loop_lore_harness_errors_total 0\n",);
    expect(block,).toContain("loop_lore_harness_spend_usd_total 0\n",);
    // Breaker gauges fold in the configured profile's state (closed at start).
    expect(block,).toContain("loop_lore_harness_breaker_open_profiles 0\n",);
    expect(block,).toContain('loop_lore_harness_breaker_trips_total{profile="p"} 0\n',);
    // Per-profile usage windows + breaker flag for the configured profile.
    expect(block,).toContain("# TYPE loop_lore_harness_profile_rpm gauge\n",);
    expect(block,).toContain('loop_lore_harness_profile_rpm{profile="p"} 0\n',);
    expect(block,).toContain('loop_lore_harness_profile_tokens_per_day{profile="p"} 0\n',);
    expect(block,).toContain('loop_lore_harness_profile_breaker_open{profile="p"} 0\n',);
  });

  it("folds finished dispatches into the counters, by result kind", () => {
    composeRuntime();
    dispatch();
    dispatch({ result: "error", },);

    const block = harnessSharedBlock();
    expect(block,).toContain("loop_lore_harness_runs_total 2\n",);
    expect(block,).toContain("loop_lore_harness_errors_total 1\n",);
    expect(block,).toContain('loop_lore_harness_errors_by_kind_total{result="error"} 1\n',);
    expect(block,).toContain('loop_lore_harness_errors_by_kind_total{result="timeout"} 0\n',);
    expect(block,).toContain('loop_lore_harness_errors_by_kind_total{result="cancelled"} 0\n',);
  });

  it("sums spend over priced runs only; unpriced runs are unknown, not free", () => {
    composeRuntime();
    // 200 tokens at 0.005 USD/1k = 0.001 USD.
    dispatch({ usage: { promptTokens: 100, completionTokens: 100, }, costPer1kTokens: 0.005, },);
    dispatch(); // unpriced (no declared rate) — contributes nothing to the sum

    expect(harnessSharedBlock(),).toContain("loop_lore_harness_spend_usd_total 0.001\n",);
  });
});
