// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — opt-in LLM classifier (WI-4).
 *
 * Prose-level audit of the DETERMINISTIC verdict via the aux pipeline:
 * when enabled (config `hooks.enableImmersionLlmClassifier`, default OFF)
 * and the deterministic path found something, the actor's prose + state
 * summary go to the `immersion-audit` aux task. The classifier may ONLY
 * downgrade severity (`downgradeSeverity` merge; hard-block is not in its
 * label vocabulary) — deterministic findings always win.
 *
 * Budget governance: when generation flow control reports the global/chat
 * budget saturated, the audit is SKIPPED and the deterministic verdict
 * stands — the opt-in audit never competes with generation for budget.
 * An aux failure/timeout (callAux → null) also leaves the verdict as-is.
 */
import type { Kysely, } from "kysely";
import { callAux, } from "../aux-pipeline";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { gateConcurrency, resolveFlowPolicy, } from "../generation/flow-control";
import type { GenerationMessage, } from "../generation/types";
import { getLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import type { GateSeverity, GateVerdict, } from "./types";
import { downgradeSeverity, severityRank, } from "./types";

/** Outcome attribution for the audit attempt. */
export interface ImmersionClassifierAudit {
  /** Whether the classifier's label was applied to the verdict. */
  readonly applied: boolean;
  /** Why the audit did not apply (skipped/failed/no-downgrade). */
  readonly reason?: string;
  /** Severity the classifier suggested (parsed; null when unparseable). */
  readonly suggested?: GateSeverity | null;
  /** Aux model that answered (attribution). */
  readonly model?: string;
}

/** Arguments for {@link auditVerdictWithLlm}. */
export interface ImmersionClassifierArgs {
  readonly db: Kysely<DB>;
  readonly config: Config;
  readonly chatId: string;
  readonly actorId: string;
  readonly userId?: string;
  /** The actor message the verdict is about. */
  readonly content: string;
  /** The deterministic verdict under audit. */
  readonly verdict: GateVerdict;
  /** Test seam: overrides the flow-control policy (defaults to resolved config). */
  readonly flowPolicy?: { maxConcurrentGlobal: number; maxConcurrentPerChat: number };
  /** Test seam: replaces callAux. */
  readonly auxCall?: typeof callAux;
}

/** Labels the classifier may return (hard-block excluded by design). */
const CLASSIFIER_LABELS: readonly string[] = ["allow", "annotate", "soft-refuse",];

/**
 * Audit a deterministic verdict with the opt-in LLM classifier.
 * @param {ImmersionClassifierArgs} args
 * @returns {Promise<{verdict: GateVerdict, audit: ImmersionClassifierAudit}>} The (possibly downgraded) verdict and the audit attribution.
 */
export async function auditVerdictWithLlm(
  args: ImmersionClassifierArgs,
): Promise<{ verdict: GateVerdict; audit: ImmersionClassifierAudit }> {
  const log = getLogger().child({ module: "immersion-classifier", },);
  if (args.config.hooks?.enableImmersionLlmClassifier !== true) {
    return { verdict: args.verdict, audit: { applied: false, reason: "disabled", }, };
  }

  // Budget governance: skip when the flow-control budget is saturated.
  const policy = args.flowPolicy ?? resolveFlowPolicy(args.config,);
  if (gateConcurrency(args.chatId, policy,) !== null) {
    return { verdict: args.verdict, audit: { applied: false, reason: "budget-saturated", }, };
  }

  const messages: GenerationMessage[] = [
    {
      role: "system",
      content: [
        "You audit a fictional-consistency verdict for an RPG narration gate.",
        "Given the actor's message and their state summary, answer with EXACTLY one label:",
        "allow, annotate, or soft-refuse. Never invent other labels.",
        "hard-block is not available to you — deterministic findings always win.",
      ].join(" ",),
    },
    {
      role: "user",
      content: [
        `Actor message: ${args.content}`,
        `State: restricted=${String(args.verdict.stateSnapshot.restricted,)},` +
        ` conditions=${safeJsonStringify(args.verdict.stateSnapshot.conditions,)},` +
        ` inventory=${safeJsonStringify(args.verdict.stateSnapshot.inventory,)},` +
        ` pending=${String(args.verdict.stateSnapshot.pendingConsequences.length,)},`,
        `Deterministic verdict: ${args.verdict.severity}` +
        (args.verdict.ruleId === null ? "" : ` via ${args.verdict.ruleId}`) + ".",
        "One label only:",
      ].join("\n",),
    },
  ];

  const call = args.auxCall ?? callAux;
  const result = await call(
    "immersion-audit",
    args.config,
    args.db,
    messages,
    { userId: args.userId, chatId: args.chatId, taskId: "immersion-audit", },
  );

  if (result === null) {
    return { verdict: args.verdict, audit: { applied: false, reason: "aux-unavailable", }, };
  }

  const label = result.content.trim().toLowerCase();
  if (!CLASSIFIER_LABELS.includes(label,)) {
    return {
      verdict: args.verdict,
      audit: { applied: false, reason: "unparseable", suggested: null, model: result.model, },
    };
  }

  const suggested = label as GateSeverity;
  const merged = downgradeSeverity(args.verdict.severity, suggested,);
  if (merged === args.verdict.severity) {
    return {
      verdict: args.verdict,
      audit: { applied: false, reason: "no-downgrade", suggested, model: result.model, },
    };
  }

  // Keep attribution explainable: the strongest finding that still stands
  // at the downgraded severity owns the rule attribution.
  const standing = args.verdict.findings.find((finding,) => finding.severity === merged);
  const ruleId = standing?.ruleId ?? args.verdict.ruleId;
  const downgradedSeverity = merged;
  const downgradedFindings = args.verdict.findings.filter(
    (finding,) => severityRank(finding.severity,) >= severityRank(downgradedSeverity,),
  );

  log.info("immersion classifier downgraded verdict", {
    chatId: args.chatId,
    actorId: args.actorId,
    from: args.verdict.severity,
    to: merged,
    model: result.model,
  },);

  return {
    verdict: {
      ...args.verdict,
      severity: merged,
      ruleId,
      findings: downgradedFindings,
      engine: "deterministic+llm-downgrade",
    },
    audit: { applied: true, suggested, model: result.model, },
  };
}
