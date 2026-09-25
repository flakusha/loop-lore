// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Metrics collector (epic-api-telemetry).
 *
 * In-process counters + latency samples per route. Push export is deferred
 * until a Prometheus pushgateway exists — the Prometheus pull endpoint
 * (routes.ts) reads this collector directly.
 */

/** */
export interface RouteStats {
  requests: number;
  errors: number;
  /** Latency samples (ms), capped ring buffer. */
  latencies: number[];
}

const LATENCY_CAP = 500;

/** */
export class MetricsCollector {
  private startedAtMs = Date.now();
  private routes = new Map<string, RouteStats>();
  private counters = new Map<string, number>();

  /** */
  recordRequest(route: string, status: number, latencyMs: number,): void {
    const stats = this.routes.get(route,) ?? { requests: 0, errors: 0, latencies: [], };
    stats.requests += 1;
    if (status >= 500) {
      stats.errors += 1;
    } else if (status === 429) {
      this.increment("rate_limited_total",);
    }
    stats.latencies.push(latencyMs,);
    if (stats.latencies.length > LATENCY_CAP) { stats.latencies.shift(); }
    this.routes.set(route, stats,);
  }

  /** */
  increment(name: string, by = 1,): void {
    this.counters.set(name, (this.counters.get(name,) ?? 0) + by,);
  }

  /** */
  snapshot(): {
    uptimeSec: number;
    routes: Array<{ route: string; requests: number; errors: number; p50: number; p95: number }>;
    counters: Record<string, number>;
  } {
    const routes = [...this.routes.entries(),].map(([route, s,],) => {
      const sorted = [...s.latencies,].sort((a, b,) => a - b);
      const pick = (q: number,) =>
        sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length,),)]!;
      return {
        route,
        requests: s.requests,
        errors: s.errors,
        p50: pick(0.5,),
        p95: pick(0.95,),
      };
    },);
    const counters: Record<string, number> = {};
    for (const [k, v,] of this.counters) { counters[k] = v; }
    return { uptimeSec: Math.floor((Date.now() - this.startedAtMs) / 1000,), routes, counters, };
  }

  /** */
  reset(): void {
    this.routes.clear();
    this.counters.clear();
    this.startedAtMs = Date.now();
  }
}

/** Process-wide collector (one per server process). */
export const metrics = new MetricsCollector();
