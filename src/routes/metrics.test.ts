// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the Prometheus metrics endpoint.
 *
 * `/metrics` is opt-in via `config.observability.metrics.enabled` (default off).
 * When disabled, the route is unmounted (404). When enabled, it returns 200
 * with `text/plain` Prometheus exposition format containing process gauges.
 * No auth; no secrets or identifiers are exposed.
 */
import { describe, expect, test } from "bun:test";
import type { Config, ObservabilityConfig } from "../config/schema";
import { metricsRoutes, renderMetrics } from "./metrics";

function configWith(metricsEnabled: boolean): Config {
  const observability: ObservabilityConfig = {
    health: { liveness: false, readiness: false },
    metrics: { enabled: metricsEnabled },
  };
  return { observability } as Config;
}

describe("metricsRoutes", () => {
  test("disabled by default: /metrics returns 404", async () => {
    const app = metricsRoutes({ config: configWith(false) });
    const res = await app.handle(new Request("http://localhost/metrics"));
    expect(res.status).toBe(404);
  });

  test("enabled: /metrics returns 200 with Prometheus text format", async () => {
    const app = metricsRoutes({ config: configWith(true) });
    const res = await app.handle(new Request("http://localhost/metrics"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/plain");
    const body = await res.text();
    expect(body).toContain("# HELP");
    expect(body).toContain("# TYPE");
    expect(body).toContain("loop_lore_process_uptime_seconds");
    expect(body).toContain("loop_lore_process_resident_memory_bytes");
  });

  test("enabled: response is parseable Prometheus exposition", async () => {
    const app = metricsRoutes({ config: configWith(true) });
    const res = await app.handle(new Request("http://localhost/metrics"));
    const body = await res.text();
    const metricLines = body
      .split("\n")
      .filter((l: string) => l.length > 0 && !l.startsWith("#"));
    expect(metricLines.length).toBeGreaterThan(0);
    for (const line of metricLines) {
      const parts = line.split(/\s+/);
      expect(parts.length).toBe(2);
      expect(Number.isNaN(Number(parts[1] ?? ""))).toBe(false);
    }
  });

  test("enabled: metrics route is mounted (not hidden)", async () => {
    const app = metricsRoutes({ config: configWith(true) });
    const res = await app.handle(new Request("http://localhost/metrics"));
    expect(res.status).toBe(200);
  });
});

describe("renderMetrics", () => {
  test("includes expected gauge families", () => {
    const out = renderMetrics();
    const names = [
      "loop_lore_process_uptime_seconds",
      "loop_lore_process_resident_memory_bytes",
      "loop_lore_process_heap_total_bytes",
      "loop_lore_process_heap_used_bytes",
      "loop_lore_process_cpu_user_microseconds",
      "loop_lore_process_cpu_system_microseconds",
    ];
    for (const name of names) {
      expect(out).toContain(name);
    }
  });

  test("every metric family has HELP, TYPE, and a numeric value line", () => {
    const out = renderMetrics();
    const families = out.split("\n# HELP ").filter((s: string) => s.length > 0);
    expect(families.length).toBeGreaterThan(0);
    for (const fam of families) {
      const block = fam.startsWith("# HELP ") ? fam : "# HELP " + fam;
      const lines = block.split("\n").filter((l: string) => l.length > 0);
      expect(lines.length).toBe(3);
      expect(lines[0]).toStartWith("# HELP");
      expect(lines[1]).toStartWith("# TYPE");
      const metricLine = lines[2] ?? "";
      const value = metricLine.split(/\s+/)[1] ?? "";
      expect(Number.isNaN(Number(value))).toBe(false);
    }
  });
});
