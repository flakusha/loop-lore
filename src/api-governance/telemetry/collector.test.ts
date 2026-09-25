// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Metrics collector + Prometheus rendering tests (epic-api-telemetry). */
import { describe, expect, test, } from "bun:test";
import { MetricsCollector, } from "./collector";
import { renderPrometheus, } from "./prometheus";

describe("MetricsCollector", () => {
  test("tracks requests, errors, and latency quantiles per route", () => {
    const c = new MetricsCollector();
    c.recordRequest("/api/v1/chats/:id", 200, 10,);
    c.recordRequest("/api/v1/chats/:id", 200, 30,);
    c.recordRequest("/api/v1/chats/:id", 500, 20,);
    const snap = c.snapshot();
    const route = snap.routes.find((r,) => r.route === "/api/v1/chats/:id")!;
    expect(route.requests,).toBe(3,);
    expect(route.errors,).toBe(1,);
    expect(route.p50,).toBeGreaterThan(0,);
    expect(route.p95,).toBeGreaterThanOrEqual(route.p50,);
  });

  test("counts 429s into the rate_limited_total counter", () => {
    const c = new MetricsCollector();
    c.recordRequest("/api/v1/x", 429, 5,);
    expect(c.snapshot().counters["rate_limited_total"],).toBe(1,);
  });

  test("latency ring buffer is capped", () => {
    const c = new MetricsCollector();
    for (let i = 0; i < 600; i++) { c.recordRequest("/r", 200, 1,); }
    expect(c.snapshot().routes[0]!.requests,).toBe(600,);
  });
});

describe("renderPrometheus", () => {
  test("renders exposition format with escaped labels", () => {
    const c = new MetricsCollector();
    c.recordRequest("/api/v1/chats/:id", 200, 12,);
    c.increment("rate_limited_total", 2,);
    const out = renderPrometheus(c,);
    expect(out,).toContain("loop_lore_uptime_seconds",);
    expect(out,).toContain('loop_lore_route_requests_total{route="/api/v1/chats/:id"} 1',);
    expect(out,).toContain("loop_lore_rate_limited_total 2",);
    expect(out.endsWith("\n",),).toBe(true,);
  });
});
