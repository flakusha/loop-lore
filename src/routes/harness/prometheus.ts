// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared Prometheus rendering for the harness metrics surfaces.
 *
 * The unauthenticated opt-in `/metrics` scrape (`src/routes/metrics.ts`) and
 * the admin-gated `GET /api/v1/harness/metrics` (routes/harness/metrics.ts)
 * render the SAME harness families from this module, so the two surfaces
 * cannot drift on metric names, HELP text, or which profiles get labelled.
 * The admin surface appends its extra scoped families on top; the public
 * scrape renders exactly the shared block and nothing more (its posture: the
 * label values are limited to CONFIGURED profile names — the ones the admin
 * settings surface already shows; a ledger row for a profile that left the
 * config would name something no admin can see, so it is not labelled).
 */
import { getExecLogCounters, } from "../../harness/exec-log";
import { getHarnessRuntime, } from "../../integrations/harness/runtime";
import { harnessProfileUsage, } from "../../integrations/harness/usage-view";

/** Prometheus text exposition content type (the version this repo writes). */
export const PROM_TEXT_MIME = "text/plain; version=0.0.4; charset=utf-8";

/**
 * Render a gauge family: HELP + TYPE + one value line.
 * @param name - metric name.
 * @param value - the gauge value.
 * @param help - the HELP text.
 * @returns the exposition block.
 */
export function gauge(name: string, value: number, help: string,): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
}

/**
 * Render a counter family: HELP + TYPE + one value line.
 * @param name - metric name (Prometheus convention: `_total` suffix).
 * @param value - the counter value.
 * @param help - the HELP text.
 * @returns the exposition block.
 */
export function counter(name: string, value: number, help: string,): string {
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
export function labelledFamily(
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
export function labelValue(name: string,): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, "_",);
}

/**
 * Render the shared harness block: run/error/spend counters plus the
 * per-profile usage windows and breaker state.
 *
 * The counters come from the exec-log WRITE path (process-local, reset on
 * restart): the exec-log read side is an O(file) tail scan, which a scrape
 * must never do. The gauges come off the composed runtime's ledger and
 * breaker — the same rows the admin usage endpoint serves.
 * @returns the exposition block, or an empty string when no runtime is composed.
 */
export function harnessSharedBlock(): string {
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
      "loop_lore_harness_breaker_trips_total",
      "How many times each harness profile's circuit breaker has opened (process-lifetime).",
      "counter",
      "profile",
      rows.map((row,) => [labelValue(row.profile,), row.breakerTrips,] as [string, number,]),
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
