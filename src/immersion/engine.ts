// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — Evaluation Engine
 *
 * Orchestrates one gate evaluation: deterministic claim extraction (WI-1) →
 * actor state snapshot (WI-2 adapters, optional pending-consequence input
 * from WI-3) → rule evaluation → {@link GateVerdict}.
 *
 * The default path is synchronous-fast and fully deterministic; the only
 * await is the snapshot read and the optional pending-consequence provider.
 * The opt-in LLM classifier (WI-4) merges downstream of this engine and may
 * only downgrade severity — it never runs inside this module.
 *
 * @module immersion/engine
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { extractClaims, } from "./extract-claims";
import { evaluateRules, } from "./rules";
import { buildActorStateSnapshot, } from "./state-snapshot";
import {
  DEFAULT_IMMERSION_CONFIG,
  type GateInput,
  GateSeverity,
  type GateVerdict,
  type ImmersionGateConfig,
  maxSeverity,
  type PendingConsequence,
} from "./types";

/** Provider for unresolved failed-check consequences (WI-3). */
export type PendingConsequenceLoader = (
  input: GateInput,
) => Promise<readonly PendingConsequence[]>;

/** Dependency surface for {@link createImmersionGate}. */
export interface ImmersionGateDeps {
  /** Kysely handle (typed; no driver import). */
  readonly db: Kysely<DB>;
  /** Rule configuration; defaults when omitted (P4 wires the per-chat surface). */
  readonly config?: ImmersionGateConfig;
  /** Pending failed-check consequence provider; none when omitted. */
  readonly loadPendingConsequences?: PendingConsequenceLoader;
}

/** Evaluate one actor message against the immersion consistency gate. */
export interface ImmersionGate {
  /**
   * Run the deterministic gate for one actor message.
   * @param {GateInput} input — chat/actor/world context + message content
   * @returns {Promise<GateVerdict>} explainable verdict (never throws for
   *   rule outcomes; oversized input throws RegexInputTooLargeError)
   * @throws {RegexInputTooLargeError} when content exceeds the pipeline cap
   */
  evaluate(input: GateInput,): Promise<GateVerdict>;
}

/**
 * Create the immersion gate. Factory + inferred type per repo convention.
 * @param {ImmersionGateDeps} deps
 * @returns {ImmersionGate}
 */
export function createImmersionGate(deps: ImmersionGateDeps,): ImmersionGate {
  const { db, config = DEFAULT_IMMERSION_CONFIG, loadPendingConsequences, } = deps;
  const log = getLogger().child({ module: "immersion-gate", },);

  return {
    async evaluate(input: GateInput,): Promise<GateVerdict> {
      const claims = extractClaims({ content: input.content, },);

      const pendingConsequences = loadPendingConsequences
        ? await loadPendingConsequences(input,)
        : [];

      const stateSnapshot = await buildActorStateSnapshot({
        db,
        actorId: input.actorId,
        worldId: input.worldId,
        pendingConsequences,
      },);

      const findings = evaluateRules({ claims, snapshot: stateSnapshot, config, },);

      let severity: GateSeverity = GateSeverity.Allow;
      let ruleId: GateVerdict["ruleId"] = null;
      for (const finding of findings) {
        if (maxSeverity(severity, finding.severity,) !== severity) {
          severity = finding.severity;
          ruleId = finding.ruleId;
        }
      }

      const verdict: GateVerdict = {
        severity,
        ruleId,
        claims,
        stateSnapshot,
        findings,
        engine: "deterministic",
      };

      if (verdict.severity !== GateSeverity.Allow) {
        log.info("Immersion gate finding", {
          chatId: input.chatId,
          actorId: input.actorId,
          severity: verdict.severity,
          ruleId: verdict.ruleId,
          findingCount: findings.length,
        },);
      }

      return verdict;
    },
  };
}
