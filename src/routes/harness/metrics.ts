// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness-scoped Prometheus metrics (TASK-harness-telemetry-metrics-health-signal-usage-ledger-endpoint).
 *
 * `GET /api/v1/harness/metrics` — admin-gated like the rest of the harness
 * surface; 503 when the runtime is not composed, so the surface is inert
 * rather than auto-anything (the sibling usage/permissions posture).
 *
 * The body is the SHARED harness block (routes/harness/prometheus.ts — the
 * same families the opt-in `/metrics` scrape carries) PLUS the families only
 * an authenticated operator surface may render: dispatch counters by exec-log
 * task type and by profile (process-lifetime exec-log counters), the
 * per-profile quota reset surface, the configured adapter flavor, and the
 * cached binary availability probe. Health folds in here rather than a
 * second JSON route: `profile_available` plus the breaker gauges ARE the
 * adapter/breaker liveness signal, and the deploy checklist's
 * provider-agnostic `/api/health` stays out of harness internals.
 *
 * Unlike the unauthenticated scrape, the by-profile dispatch counter is NOT
 * filtered to currently-configured profiles: an operator asking "who ran
 * what" needs the lifetime count of a profile that has since left the config,
 * and an admin can already see any profile name through `/harness/runs`.
 */
import { Elysia, } from "elysia";
import { getExecLogCounters, } from "../../harness/exec-log";
import { probeHarnessCommand, } from "../../integrations/harness/availability";
import { DEFAULT_HARNESS_FLAVOR, } from "../../integrations/harness/flavor-factories";
import { getHarnessRuntime, } from "../../integrations/harness/runtime";
import { harnessProfileUsage, } from "../../integrations/harness/usage-view";
import { requirePermission, } from "../../middleware/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, } from "../http-utils";
import { harnessSharedBlock, labelledFamily, labelValue, PROM_TEXT_MIME, } from "./prometheus";

/** Error when the runtime (and with it every harness metric) is missing. */
const NOT_COMPOSED = {
  message: "harness runtime not composed — the ACP integration is disabled or not booted",
  status: HttpStatus.ServiceUnavailable,
  code: ErrorCode.ServiceUnavailable,
} as const;

/**
 * Render the admin-only harness families, on top of the shared block.
 *
 * Availability probes read the per-process cache (first scrape after boot
 * pays one `--version` spawn per configured profile; every later scrape is a
 * cache hit, exactly like the admin settings surface).
 * @returns the scoped exposition families.
 */
export async function harnessScopedFamilies(): Promise<string> {
  const runtime = getHarnessRuntime();
  if (!runtime) { return ""; }

  const counters = getExecLogCounters();
  const configured = runtime.acp.profiles;
  const rows = harnessProfileUsage(runtime,);
  const lines: string[] = [];

  // Dispatch counters: by exec-log task type (closed vocabulary) and by
  // external-harness profile (lifetime, unfiltered — see the header note).
  lines.push(
    labelledFamily(
      "loop_lore_harness_dispatch_total",
      "Harness dispatches by exec-log task type, appended by this process since it started.",
      "counter",
      "task_type",
      Object.entries(counters.byTaskType,),
    ),
  );

  lines.push(
    labelledFamily(
      "loop_lore_harness_profile_dispatch_total",
      "Harness dispatches by external-harness profile (lifetime; profiles that left the config keep their count).",
      "counter",
      "profile",
      Object.entries(counters.byProfile,).map(([profile, value,],) =>
        [labelValue(profile,), value,] as [string, number,]
      ),
    ),
  );

  // Quota surface: the furthest reported reset per profile, unix seconds.
  lines.push(
    labelledFamily(
      "loop_lore_harness_profile_quota_reset_epoch_seconds",
      "Externally reported quota reset per harness profile (unix seconds; 0 = no reported reset).",
      "gauge",
      "profile",
      rows.map((row,) =>
        [labelValue(row.profile,), row.quotaResetAt === null ? 0 : Math.floor(row.quotaResetAt / 1000,),] as [
          string,
          number,
        ]
      ),
    ),
  );

  // Adapter identity: which configured flavor serves each profile.
  const infoHead =
    "# HELP loop_lore_harness_profile_info The configured harness flavor serving each profile.\n# TYPE loop_lore_harness_profile_info gauge\n";

  const infoBody = configured
    .map((profile,) =>
      `loop_lore_harness_profile_info{profile="${labelValue(profile.name,)}",flavor="${
        labelValue(profile.harness ?? DEFAULT_HARNESS_FLAVOR,)
      }"} 1\n`
    )
    .join("",);

  lines.push(infoHead + infoBody,);

  // Adapter liveness: did the configured binary answer its availability
  // probe. Sequential by policy (Promise.all is restricted); probes are
  // per-process cached, so a steady-state scrape never spawns at all.
  const availability: number[] = [];

  for (const profile of configured) {
    const verdict = await probeHarnessCommand({ command: profile.command, },);
    availability.push(verdict.available ? 1 : 0,);
  }

  lines.push(
    labelledFamily(
      "loop_lore_harness_profile_available",
      "1 when the profile's configured binary answered its availability probe (per-process cache; adapter liveness).",
      "gauge",
      "profile",
      configured.map((profile, index,) => [labelValue(profile.name,), availability[index] ?? 0,] as [string, number,]),
    ),
  );

  return lines.join("",);
}

/**
 * Render the whole admin harness metrics body: shared block + scoped families.
 * @returns the Prometheus exposition text.
 */
export async function renderHarnessMetrics(): Promise<string> {
  return harnessSharedBlock() + await harnessScopedFamilies();
}

/**
 * Build the harness metrics route plugin.
 * @param prefix - Mount prefix. Admin-gated like the rest of the harness
 *   surface, so the default is the versioned root.
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessMetricsRoutes(prefix = "/api/v1",) {
  const guard = requirePermission("admin.system",);
  const denied = { 403: ErrorResponse, } as const;

  return new Elysia({ name: "harness-metrics", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app.get(`${prefix}/harness/metrics`, async () => {
        if (!getHarnessRuntime()) { return jsonError(NOT_COMPOSED,); }

        return new Response(await renderHarnessMetrics(), {
          status: 200,
          headers: { "content-type": PROM_TEXT_MIME, },
        },);
      }, {
        response: { 503: ErrorResponse, ...denied, },
        detail: {
          summary: "Harness metrics (Prometheus)",
          description:
            "Admin-gated Prometheus exposition of the harness block (runs/errors/spend, per-profile usage windows, breaker state) plus dispatch counters by task type and profile, quota resets, adapter flavors, and cached binary availability.",
          tags: ["Harness", "Metrics",],
        },
      },),);
}
