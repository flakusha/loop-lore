// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prometheus text-exposition rendering of a MetricsCollector snapshot
 * (epic-api-telemetry). Names follow Prometheus conventions: lowercase,
 * snake_case, unit suffixes.
 */
import type { MetricsCollector, } from "./collector";

function escapeLabel(v: string,): string {
  return v.replace(/\\/g, "\\\\",).replace(/"/g, '\\"',).replace(/\n/g, "\\n",);
}

/** */
export function renderPrometheus(collector: MetricsCollector,): string {
  const snap = collector.snapshot();
  const lines: string[] = [];

  lines.push("# HELP loop_lore_uptime_seconds Server uptime in seconds.",);
  lines.push("# TYPE loop_lore_uptime_seconds gauge",);
  lines.push(`loop_lore_uptime_seconds ${snap.uptimeSec}`,);

  lines.push("# HELP loop_lore_route_requests_total Total requests per route.",);
  lines.push("# TYPE loop_lore_route_requests_total counter",);
  for (const r of snap.routes) {
    lines.push(`loop_lore_route_requests_total{route="${escapeLabel(r.route,)}"} ${r.requests}`,);
  }

  lines.push("# HELP loop_lore_route_errors_total Total 5xx responses per route.",);
  lines.push("# TYPE loop_lore_route_errors_total counter",);
  for (const r of snap.routes) {
    lines.push(`loop_lore_route_errors_total{route="${escapeLabel(r.route,)}"} ${r.errors}`,);
  }

  lines.push("# HELP loop_lore_route_latency_ms Route latency quantiles (ms) over a capped sample window.",);
  lines.push("# TYPE loop_lore_route_latency_ms gauge",);
  for (const r of snap.routes) {
    lines.push(`loop_lore_route_latency_ms{route="${escapeLabel(r.route,)}",quantile="0.5"} ${r.p50}`,);
    lines.push(`loop_lore_route_latency_ms{route="${escapeLabel(r.route,)}",quantile="0.95"} ${r.p95}`,);
  }

  for (const [name, value,] of Object.entries(snap.counters,)) {
    lines.push(`# TYPE loop_lore_${name} counter`,);
    lines.push(`loop_lore_${name} ${value}`,);
  }

  return `${lines.join("\n",)}\n`;
}
