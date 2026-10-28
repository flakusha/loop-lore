// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — refusal narration builders (WI-5).
 *
 * Deterministic text for the three gate outcomes that produce output:
 * soft-refuse → attempted-action framing injected into the GM/narration
 * prompt (the obstacle beat); annotate → a contradiction hint woven into
 * prompts; hard-block → an OOC system notice with the turn-skip escape
 * hatch (TASK-turn-skip-gate-interlock: the notice MUST offer skip).
 *
 * Refusal is narrated in-fiction and never moralized: the soft-refuse and
 * annotate texts direct the narrator, they do not judge the actor. OOC
 * reasoning appears only in the hard-block notice, per the epic truths.
 */
import type { GateVerdict, } from "./types";

/**
 * Attempted-action framing for a soft-refuse verdict (injected into the
 * GM/narration prompt). States the attempt and its failure as scene fact.
 * @param {GateVerdict} verdict
 * @returns {string}
 */
export function buildSoftRefuseFraming(verdict: GateVerdict,): string {
  const attempts = verdict.claims.map((claim,) => claim.text).join("; ",);
  const reasons = verdict.findings.map((finding,) => finding.reason).join("; ",);
  return [
    "Narration directive (obstacle beat): the attempted action fails.",
    `Attempted: ${attempts}.`,
    `Why it fails: ${reasons}.`,
    "Narrate the obstacle, the attempt, and its consequences in-fiction — the action does not succeed. Stay in the scene; do not step outside it.",
  ].join(" ",);
}

/**
 * Contradiction hint for an annotate verdict (woven into prompts as a
 * consistency note; the action proceeds but the constraint is honored).
 * @param {GateVerdict} verdict
 * @returns {string}
 */
export function buildAnnotateHint(verdict: GateVerdict,): string {
  const reasons = verdict.findings.map((finding,) => finding.reason).join("; ",);
  return `Consistency note for the scene: ${reasons}. Weave this constraint into the narration naturally.`;
}

/**
 * OOC system notice for a hard-block verdict. The only place OOC reasoning
 * is allowed. Per TASK-turn-skip-gate-interlock the notice MUST offer the
 * turn-skip escape hatch so a blocked actor is never trapped.
 * @param {GateVerdict} verdict
 * @param {object} names
 * @param {string} names.actorName
 * @returns {string}
 */
export function buildHardBlockNotice(verdict: GateVerdict, names: { actorName: string },): string {
  const reasons = verdict.findings.map((finding,) => finding.reason).join("; ",);
  return [
    "[OOC] That action can't happen in the current scene:",
    `${reasons}.`,
    `${names.actorName} can skip this beat instead — send a turn skip (hold or advance) — or take a different action.`,
  ].join(" ",);
}

/**
 * Structured gate verdict payload for the `gate.verdict` plugin event
 * (epic Cross-System Events contract).
 * @param {GateVerdict} verdict
 * @param {object} ids
 * @param {string} ids.chatId
 * @param {string} ids.actorId
 * @returns {Record<string, unknown>}
 */
export function gateVerdictEventPayload(
  verdict: GateVerdict,
  ids: { chatId: string; actorId: string },
): Record<string, unknown> {
  return {
    chatId: ids.chatId,
    actorId: ids.actorId,
    severity: verdict.severity,
    ruleId: verdict.ruleId,
    engine: verdict.engine,
    claims: verdict.claims.map((claim,) => ({ kind: claim.kind, text: claim.text, })),
  };
}
