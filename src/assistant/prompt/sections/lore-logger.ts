// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore section logger — the structured-logging surface for lore prompt
 * assembly.
 *
 * The repo has no lore-specific telemetry (no `lore` counters under
 * `src/telemetry/`; the Prometheus counters are product-prefixed and cannot
 * attribute a skip to a group), so the group admission pass logs its
 * admits/skips through the structured logger instead.
 */
import { getChildLogger, } from "../../../logger";
import type { Logger, } from "../../../logger";
import type { InclusionGroupDecision, } from "./lore-activation";

/** Child logger for the lore section; null when no root logger is initialized. */
export function loreLogger(): Logger | null {
  return getChildLogger("assistant/prompt/lore",);
}

/**
 * Log the inclusion-group admission decisions — the group that fired and the
 * group members it excluded.
 * @param decisions
 * @returns void
 */
export function logGroupAdmissions(decisions: readonly InclusionGroupDecision[],): void {
  const log = loreLogger();
  if (!log) { return; }
  for (const decision of decisions) {
    log.debug("lore inclusion group admission", {
      group: decision.group,
      winner_id: decision.winner_id,
      skipped_ids: decision.skipped_ids,
    },);
  }
}
