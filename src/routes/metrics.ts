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
import { getExecLogCounters, } from "../harness/exec-log";
import { getHarnessRuntime, } from "../integrations/harness/runtime";
import { harnessProfileUsage, } from "../integrations/harness/usage-view";

const MimeType = "text/plain; version=0.0.4; charset=utf-8";

interface MetricsOpts {
  config: Config;
}

/**
 * @param v
 * @param name
 * @param value
 * @param help
 */
function gauge(name: string, value: number, help: string,): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
}

/**
 * Render a counter family: HELP + TYPE + one value line.
 * @param name - metric name (Prometheus convention: `_total` suffix).
 * @param value - the counter value.
 * @param help - the HELP text.
 * @returns the exposition block.
 */
function counter(name: string, value: number, help: string,): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name} ${value}\n`;
}

/**
 * Render a metric family with one labelled sample per entry.
 * @param name - metric name.
 * @param help - the HELP text.
 * @param type - the metric type (`gauge` or `counter`).
 * @param labelName - the label key (`profile`, `result`, ...).
 * @param samples - the label/value pairs, in render order.
 * @returns the exposition block.
 */
function labelledFamily(
  name: string,
  help: string,
  type: "gauge" | "counter",
  labelName: string,
  samples: Array<[string, number,]>,
): string {
  const head = `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n`;
  const body = samples.map(([label, value,],) => `${name}{${labelName}="${label}"} ${value}\n`).join("",);
  return head + body;
}

/**
 * A label value safe to embed in the exposition format: Prometheus splits a
 * sample line on whitespace, so a profile name with a space would break the
 * scrape. Profile names are config-level identifiers, so the safe set is wide
 * enough to keep them readable.
 * @param name - the raw profile name.
 * @returns the sanitized label value.
 */
function labelValue(name: string,): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, "_",);
}

/**
 * Render the harness block: run/error/spend counters plus the per-profile
 * usage windows and breaker state.
 *
 * The counters come from the exec-log WRITE path (process-local, reset on
 * restart): the exec-log read side is an O(file) tail scan, which a scrape
 * must never do. The gauges come off the composed runtime's ledger and
 * breaker — the same rows the admin usage endpoint serves.
 *
 * `/metrics` is unauthenticated (opt-in), so the label values are limited to
 * the CONFIGURED ACP profile names — the ones the admin settings surface
 * already shows. A ledger row for a profile that has since left the config
 * would name something no admin can see, so it is not labelled here. No
 * prompt content, secret or user identifier is exposed.
 * @returns the exposition block, or an empty string when no runtime is composed.
 */
function harnessMetrics(): string {
  const runtime = getHarnessRuntime();
  if (!runtime) { return ""; }

  const counters = getExecLogCounters();
  const configured = new Set(runtime.acp.profiles.map((profile,) => profile.name),);
  const rows = harnessProfileUsage(runtime,).filter((row,) => configured.has(row.profile,));
  const lines: string[] = [];
  lines.push(
    counter(
      "loop_lore_harness_runs_total",
      counters.runs,
      "Harness runs appended to the exec log by this process since it started (process-local, resets on restart).",
    ),
  );

  lines.push(
    counter(
      "loop_lore_harness_errors_total",
      counters.errors,
      "Harness runs with a non-ok result appended to the exec log by this process since it started.",
    ),
  );

  lines.push(
    counter(
      "loop_lore_harness_spend_usd_total",
      counters.spendUsd,
      "USD spend summed over the priced harness runs appended by this process (unpriced runs are unknown, not free).",
    ),
  );

  lines.push(
    labelledFamily(
      "loop_lore_harness_errors_by_kind_total",
      "Harness runs with a non-ok result, by result kind, appended by this process since it started.",
      "counter",
      "result",
      [
        ["error", counters.byKind.error,],
        ["timeout", counters.byKind.timeout,],
        ["cancelled", counters.byKind.cancelled,],
      ],
    ),
  );

  lines.push(
    gauge(
      "loop_lore_harness_breaker_open_profiles",
      rows.filter((row,) => row.breakerOpen).length,
      "Configured harness profiles whose circuit breaker is currently blocking dispatches.",
    ),
  );

  lines.push(
    labelledFamily(
      "loop_lore_harness_profile_rpm",
      "Harness dispatches per profile inside the rolling 60s window.",
      "gauge",
      "profile",
      rows.map((row,) => [labelValue(row.profile,), row.dispatchesInWindow,] as [string, number,]),
    ),
  );

  lines.push(
    labelledFamily(
      "loop_lore_harness_profile_tokens_per_day",
      "Harness tokens per profile inside the rolling 24h window.",
      "gauge",
      "profile",
      rows.map((row,) => [labelValue(row.profile,), row.tokensInDay,] as [string, number,]),
    ),
  );

  lines.push(
    labelledFamily(
      "loop_lore_harness_profile_breaker_open",
      "Whether the harness profile's circuit breaker is currently blocking dispatches (1 = open).",
      "gauge",
      "profile",
      rows.map((row,) => [labelValue(row.profile,), row.breakerOpen ? 1 : 0,] as [string, number,]),
    ),
  );

  return lines.join("",);
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

  // The harness block renders only when the ACP runtime is composed; a
  // disabled integration contributes no harness metrics at all.
  lines.push(harnessMetrics(),);

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
