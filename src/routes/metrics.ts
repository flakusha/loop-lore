// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prometheus metrics endpoint.
 *
 * `GET /metrics` — returns process-level metrics in Prometheus text exposition
 * format. OPT-IN via `config.observability.metrics.enabled` (default off).
 * When disabled, the route is NOT mounted. Exposes only aggregate process
 * metrics (uptime, memory, event loop); no secrets, user identifiers, or
 * request-scoped data.
 */
import { Elysia, } from "elysia";
import type { Config, } from "../config/schema";

const MimeType = "text/plain; version=0.0.4; charset=utf-8";

interface MetricsOpts {
  config: Config;
}

/** @param v */
function gauge(name: string, value: number, help: string,): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
}

/** Collect process metrics and render Prometheus text format. */
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
  return lines.join("",);
}

/** @param opts */
export function metricsRoutes(opts: MetricsOpts,): Elysia {
  const { config, } = opts;
  const app = new Elysia();

  if (config.observability.metrics.enabled) {
    app.get("/metrics", () => {
      return new Response(renderMetrics(), {
        status: 200,
        headers: { "content-type": MimeType, },
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
