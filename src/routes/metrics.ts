// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prometheus metrics endpoint.
 *
 * `GET /metrics` — returns process-level metrics in Prometheus text exposition
 * format. OPT-IN via `config.observability.metrics.enabled` (default off).
 * When disabled, the route is NOT mounted. Exposes only aggregate process
 * metrics (uptime, memory, event loop) plus, when the harness runtime is
 * composed, the harness block (run/error/spend counters, per-profile usage
 * windows, breaker state); no secrets, user identifiers, prompt content, or
 * request-scoped data.
 */
import { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import { gauge, harnessSharedBlock, PROM_TEXT_MIME, } from "./harness/prometheus";

interface MetricsOpts {
  config: Config;
}

/**
 * Collect process metrics and render Prometheus text format.
 * @returns {string}
 */
export function renderMetrics(): string {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const uptime = Math.floor(process.uptime(),);
  const lines: string[] = [];
  lines.push(gauge("loop_lore_process_uptime_seconds", uptime, "Process uptime in seconds.",),);
  lines.push(
    gauge(
      "loop_lore_process_resident_memory_bytes",
      mem.rss,
      "Resident set size in bytes.",
    ),
  );

  lines.push(
    gauge(
      "loop_lore_process_heap_total_bytes",
      mem.heapTotal,
      "Total heap allocated in bytes.",
    ),
  );

  lines.push(
    gauge(
      "loop_lore_process_heap_used_bytes",
      mem.heapUsed,
      "Heap used in bytes.",
    ),
  );

  lines.push(
    gauge(
      "loop_lore_process_external_memory_bytes",
      mem.external,
      "External (C++) memory in bytes.",
    ),
  );

  lines.push(
    gauge(
      "loop_lore_process_cpu_user_microseconds",
      cpu.user,
      "User CPU time in microseconds.",
    ),
  );

  lines.push(
    gauge(
      "loop_lore_process_cpu_system_microseconds",
      cpu.system,
      "System CPU time in microseconds.",
    ),
  );

  lines.push(
    gauge(
      "loop_lore_node_active_handles",
      (process as unknown as { _activeHandles?: unknown[] })._activeHandles?.length ?? 0,
      "Active libuv handles.",
    ),
  );

  // The shared harness block renders only when the ACP runtime is composed; a
  // disabled integration contributes no harness metrics at all. The admin-gated
  // `GET /api/v1/harness/metrics` renders the SAME block plus its scoped
  // families (routes/harness/metrics.ts).
  lines.push(harnessSharedBlock(),);

  return lines.join("",);
}

/**
 * @param opts
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function metricsRoutes(opts: MetricsOpts,): Elysia {
  const { config, } = opts;
  const app = new Elysia();

  if (config.observability.metrics.enabled) {
    app.get("/metrics", () => {
      return new Response(renderMetrics(), {
        status: 200,
        headers: { "content-type": PROM_TEXT_MIME, },
      },);
    }, {
      detail: {
        summary: "Prometheus metrics",
        description: "Process-level metrics in Prometheus text exposition format. No auth; opt-in.",
        tags: ["Metrics",],
      },
    },);
  }

  return app;
}
