// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Boot readiness summary line (TASK-boot-readiness-summary).
 *
 * Human-readable projection of the shared setup checks
 * (`src/routes/setup/checks.ts`), logged once at the `ready = true`
 * transition in `src/server/start.ts`. SECRET RULE: the line carries check
 * ids + ok/off booleans only — never env values, secret values, provider
 * error text, or paths. The signature only admits `id`/`ok` so hints (which
 * name env vars and failing providers) cannot leak in.
 */
import type { SetupCheck, } from "../routes/setup/checks";

/**
 * Build the one-line boot readiness summary.
 * @param checks - Setup checks; only `id` and `ok` are read.
 * @returns The summary line, e.g. `setup readiness: degraded (off: tls, smk)`.
 */
export function buildBootReadinessSummary(checks: ReadonlyArray<Pick<SetupCheck, "id" | "ok">>,): string {
  const off = checks.filter((check,) => !check.ok).map((check,) => check.id);
  if (off.length === 0) { return "setup readiness: ready (all checks ok)"; }
  return `setup readiness: degraded (off: ${off.join(", ",)})`;
}
