// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — Deterministic Rule Engine (WI-2)
 *
 * Evaluates extracted claims against the actor state snapshot. Every finding
 * is explainable: rule id, offending claim, and a reason naming the missing
 * precondition. Findings never silently block — the severity ladder decides
 * the downstream behavior (allow / annotate / soft-refuse / hard-block).
 *
 * Pure function over ({claims, snapshot, config}) — no I/O, no clock, fully
 * deterministic (required for the deterministic-wins precedence).
 *
 * @module immersion/rules
 */
import {
  type ActorStateSnapshot,
  type ExtractedClaim,
  type GateFinding,
  GateRuleId,
  GateSeverity,
  type ImmersionGateConfig,
  severityRank,
} from "./types";

/**
 * Item-name match: exact, contained, or containing ("potion" ⊆ "healing
 * potion of vitality"). Guards against plural/article noise after
 * normalization.
 * @param {string} claimed — lowercased claimed item name
 * @param {readonly string[]} inventory — lowercased carried item names
 * @returns {boolean} true when the claimed item is plausibly owned
 */
function inventoryHas(claimed: string, inventory: readonly string[],): boolean {
  return inventory.some((owned,) =>
    owned === claimed ||
    owned.includes(claimed,) ||
    claimed.includes(owned,)
  );
}

function ruleSeverity(config: ImmersionGateConfig, ruleId: GateRuleId,): GateSeverity {
  return config.rules[ruleId]?.severity ?? GateSeverity.Annotate;
}

function ruleEnabled(config: ImmersionGateConfig, ruleId: GateRuleId,): boolean {
  return config.rules[ruleId]?.enabled ?? true;
}

/**
 * Rule `immersion.movement-while-restrained`: a movement claim from an actor
 * whose state says they cannot move freely (restrained conditions, or an
 * incapacitating character state). Missing precondition: freedom of movement.
 * @param {readonly ExtractedClaim[]} claims
 * @param {ActorStateSnapshot} snapshot
 * @param {ImmersionGateConfig} config
 * @returns {GateFinding[]}
 */
function movementWhileRestrained(
  claims: readonly ExtractedClaim[],
  snapshot: ActorStateSnapshot,
  config: ImmersionGateConfig,
): GateFinding[] {
  if (!snapshot.restricted || !ruleEnabled(config, GateRuleId.MovementWhileRestrained,)) {
    return [];
  }

  const findings: GateFinding[] = [];
  for (const claim of claims) {
    if (claim.kind !== "movement") {
      continue;
    }

    const stateWhy = snapshot.conditions.length > 0
      ? `conditioned (${snapshot.conditions.join(", ",)})`
      : `in state "${snapshot.characterState}"`;

    findings.push({
      ruleId: GateRuleId.MovementWhileRestrained,
      severity: ruleSeverity(config, GateRuleId.MovementWhileRestrained,),
      claim,
      reason: `actor claims to "${claim.verb}" while ${stateWhy}` +
        ` — missing precondition: freedom of movement`,
    },);
  }

  return findings;
}

/**
 * Rule `immersion.skill-not-owned`: a named skill the actor does not know.
 * Missing precondition: owning the claimed skill.
 * @param {readonly ExtractedClaim[]} claims
 * @param {ActorStateSnapshot} snapshot
 * @param {ImmersionGateConfig} config
 * @returns {GateFinding[]}
 */
function skillNotOwned(
  claims: readonly ExtractedClaim[],
  snapshot: ActorStateSnapshot,
  config: ImmersionGateConfig,
): GateFinding[] {
  if (!ruleEnabled(config, GateRuleId.SkillNotOwned,)) {
    return [];
  }

  const findings: GateFinding[] = [];
  for (const claim of claims) {
    if (claim.kind !== "skill") {
      continue;
    }

    const known = snapshot.skills.includes(claim.skill,);
    if (known) {
      continue;
    }

    findings.push({
      ruleId: GateRuleId.SkillNotOwned,
      severity: ruleSeverity(config, GateRuleId.SkillNotOwned,),
      claim,
      reason: `actor claims to use skill "${claim.skill}"` +
        ` — missing precondition: actor knows the skill "${claim.skill}"`,
    },);
  }

  return findings;
}

/**
 * Rule `immersion.item-not-in-inventory`: interacting with an item the actor
 * does not carry. Missing precondition: the item being in the inventory.
 * @param {readonly ExtractedClaim[]} claims
 * @param {ActorStateSnapshot} snapshot
 * @param {ImmersionGateConfig} config
 * @returns {GateFinding[]}
 */
function itemNotInInventory(
  claims: readonly ExtractedClaim[],
  snapshot: ActorStateSnapshot,
  config: ImmersionGateConfig,
): GateFinding[] {
  if (!ruleEnabled(config, GateRuleId.ItemNotInInventory,)) {
    return [];
  }

  const findings: GateFinding[] = [];
  for (const claim of claims) {
    if (claim.kind !== "item") {
      continue;
    }

    if (inventoryHas(claim.item, snapshot.inventory,)) {
      continue;
    }

    findings.push({
      ruleId: GateRuleId.ItemNotInInventory,
      severity: ruleSeverity(config, GateRuleId.ItemNotInInventory,),
      claim,
      reason: `actor claims to ${claim.action} "${claim.item}"` +
        ` — missing precondition: item "${claim.item}" in inventory`,
    },);
  }

  return findings;
}

/**
 * Rule `immersion.pending-failed-check` (WI-3): a claim matching an
 * unresolved failed-check consequence's blocked keyword (verb, skill, or
 * item name). Missing precondition: the consequence being resolved.
 * @param {readonly ExtractedClaim[]} claims
 * @param {ActorStateSnapshot} snapshot
 * @param {ImmersionGateConfig} config
 * @returns {GateFinding[]}
 */
function pendingFailedCheck(
  claims: readonly ExtractedClaim[],
  snapshot: ActorStateSnapshot,
  config: ImmersionGateConfig,
): GateFinding[] {
  if (!ruleEnabled(config, GateRuleId.PendingFailedCheck,)) {
    return [];
  }

  const findings: GateFinding[] = [];
  for (const claim of claims) {
    const keywords = claimKeywords(claim,);
    for (const consequence of snapshot.pendingConsequences) {
      if (!keywords.includes(consequence.blockedAction,)) {
        continue;
      }

      findings.push({
        ruleId: GateRuleId.PendingFailedCheck,
        severity: ruleSeverity(config, GateRuleId.PendingFailedCheck,),
        claim,
        reason: `pending failed-check "${consequence.id}" constrains` +
          ` "${consequence.blockedAction}" — missing precondition: consequence resolved` +
          ` (${consequence.reason})`,
      },);
    }
  }

  return findings;
}

/** Keywords a claim can be constrained by (lowercased verb/skill/item). */
function claimKeywords(claim: ExtractedClaim,): string[] {
  switch (claim.kind) {
    case "movement":
    case "action":
      return [claim.verb,];
    case "skill":
      return [claim.skill,];
    case "item":
      return [claim.item, claim.action,];
  }
}

/**
 * Evaluate all deterministic rules. Findings are returned strongest-severity
 * first (stable within equal severity by rule order).
 * @param {object} args
 * @param {readonly ExtractedClaim[]} args.claims
 * @param {ActorStateSnapshot} args.snapshot
 * @param {ImmersionGateConfig} args.config
 * @returns {GateFinding[]} rule violations (empty when the message is consistent)
 */
export function evaluateRules(args: {
  claims: readonly ExtractedClaim[];
  snapshot: ActorStateSnapshot;
  config: ImmersionGateConfig;
},): GateFinding[] {
  const { claims, snapshot, config, } = args;
  const findings = [
    ...movementWhileRestrained(claims, snapshot, config,),
    ...skillNotOwned(claims, snapshot, config,),
    ...itemNotInInventory(claims, snapshot, config,),
    ...pendingFailedCheck(claims, snapshot, config,),
  ];

  findings.sort((a, b,) => {
    if (a.severity !== b.severity) {
      return severityRank(b.severity,) - severityRank(a.severity,);
    }

    return 0;
  },);

  return findings;
}
