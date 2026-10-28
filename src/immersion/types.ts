// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — Verdict & Claim Types
 *
 * Contract for the immersion consistency gate (epic-immersion-consistency-gate):
 * pre-generation analysis of the actor message against authoritative world and
 * actor state. This gate is about *fictional consistency*, not content policy —
 * it is independent from `src/nsfw/`.
 *
 * Two engines, one verdict: deterministic rule checks win; the (opt-in) LLM
 * classifier may only downgrade severity, never upgrade. Explainability is
 * mandatory — every non-`allow` verdict names the rule and the missing
 * precondition, never a silent block.
 *
 * @module immersion/types
 */

/** Severity ladder applied to a gate finding. Ordered from most permissive. */
export const GateSeverity = {
  Allow: "allow",
  /** Pass through + inject a contradiction hint into prompts. */
  Annotate: "annotate",
  /** Message consumed as an *attempted* action; narration generates the obstacle. */
  SoftRefuse: "soft-refuse",
  /** Rejected pre-generation; OOC system notice; skip affordance offered. */
  HardBlock: "hard-block",
} as const;
/** */
export type GateSeverity = (typeof GateSeverity)[keyof typeof GateSeverity];

/** Numeric rank used to resolve the strongest severity among findings. */
const SEVERITY_RANK: Readonly<Record<GateSeverity, number>> = {
  [GateSeverity.Allow]: 0,
  [GateSeverity.Annotate]: 1,
  [GateSeverity.SoftRefuse]: 2,
  [GateSeverity.HardBlock]: 3,
};

/** Comparable rank for a severity (allow=0 … hard-block=3). */
export function severityRank(severity: GateSeverity,): number {
  return SEVERITY_RANK[severity];
}

/**
 * Resolve the stronger of two severities (deterministic findings win; the
 * classifier may only ever pick the *weaker* one).
 * @param {GateSeverity} a
 * @param {GateSeverity} b
 * @returns {GateSeverity} the higher-ranked severity
 */
export function maxSeverity(a: GateSeverity, b: GateSeverity,): GateSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

/**
 * Downgrade `from` to `to` when `to` is weaker — the only direction the LLM
 * classifier is allowed to move a deterministic verdict.
 * @param {GateSeverity} from
 * @param {GateSeverity} to
 * @returns {GateSeverity}
 */
export function downgradeSeverity(from: GateSeverity, to: GateSeverity,): GateSeverity {
  return SEVERITY_RANK[to] < SEVERITY_RANK[from] ? to : from;
}

/** Deterministic rule identifiers. Stable strings — they feed the audit log. */
export const GateRuleId = {
  /** Movement claim while the actor is restrained or incapacitated. */
  MovementWhileRestrained: "immersion.movement-while-restrained",
  /** Claimed skill use absent from the actor's known skills. */
  SkillNotOwned: "immersion.skill-not-owned",
  /** Item interaction claim for an item not in the actor's inventory. */
  ItemNotInInventory: "immersion.item-not-in-inventory",
  /** Follow-up claim constrained by an unresolved failed-check consequence. */
  PendingFailedCheck: "immersion.pending-failed-check",
} as const;
/** */
export type GateRuleId = (typeof GateRuleId)[keyof typeof GateRuleId];

/** All rule ids in evaluation order. */
export const GATE_RULE_ORDER: readonly GateRuleId[] = [
  GateRuleId.MovementWhileRestrained,
  GateRuleId.SkillNotOwned,
  GateRuleId.ItemNotInInventory,
  GateRuleId.PendingFailedCheck,
] as const;

/** Discriminator for {@link ExtractedClaim}. */
export type ClaimKind = "movement" | "skill" | "item" | "action";

/** Ownership-consuming item interactions the inventory rule checks. */
export type ItemAction = "equip" | "use" | "draw" | "wield" | "consume" | "read";

interface ClaimBase {
  /** The verbatim matched span from the actor message. */
  readonly text: string;
  /** Offset of the match within the message. */
  readonly matchIndex: number;
}

/** A first-person (or staged `*…*`) movement claim. */
export interface MovementClaim extends ClaimBase {
  readonly kind: "movement";
  /** Lowercased movement verb. */
  readonly verb: string;
}

/** A claim to use a named skill or spell-like ability. */
export interface SkillClaim extends ClaimBase {
  readonly kind: "skill";
  /** Lowercased claimed skill name. */
  readonly skill: string;
}

/** A claim to interact with a (named) item the actor should already own. */
export interface ItemClaim extends ClaimBase {
  readonly kind: "item";
  /** Lowercased claimed item name. */
  readonly item: string;
  /** What the actor claims to do with the item. */
  readonly action: ItemAction;
}

/** A generic attempted action (candidate for pending-consequence constraints). */
export interface ActionClaim extends ClaimBase {
  readonly kind: "action";
  /** Lowercased action verb. */
  readonly verb: string;
}

/** A structured claim extracted from the actor message (WI-1). */
export type ExtractedClaim = MovementClaim | SkillClaim | ItemClaim | ActionClaim;

/**
 * An unresolved failed-check consequence (WI-3) that constrains follow-up
 * claims until the fiction resolves it.
 */
export interface PendingConsequence {
  /** Stable id (also the audit anchor). */
  readonly id: string;
  /** Lowercased action/skill/item keyword the consequence constrains. */
  readonly blockedAction: string;
  /** In-fiction reason (narrated, never moralized). */
  readonly reason: string;
}

/**
 * Authoritative actor state the rules check against (SC10-style adapter).
 *
 * SEAM: `epic-player-state-machine` will replace this snapshot with the
 * layered canonical state module; until then it is assembled directly from
 * `character_stats`, `character_skills` and `world_items`.
 */
export interface ActorStateSnapshot {
  readonly actorId: string;
  /** Raw `character_stats.character_state` value ("unknown" when absent). */
  readonly characterState: string;
  /** Lowercased `conditions` names from `character_stats`. */
  readonly conditions: readonly string[];
  /** Derived: restriction vocabulary hit or incapacitating state. */
  readonly restricted: boolean;
  /** Lowercased known skill names. */
  readonly skills: readonly string[];
  /** Lowercased carried item names. */
  readonly inventory: readonly string[];
  /** Unresolved failed-check constraints (WI-3 provider). */
  readonly pendingConsequences: readonly PendingConsequence[];
}

/** One rule violation with its explainable reason. */
export interface GateFinding {
  readonly ruleId: GateRuleId;
  /** Severity the rule proposes (before per-chat config resolution). */
  readonly severity: GateSeverity;
  /** The offending claim. */
  readonly claim: ExtractedClaim;
  /** Human-readable explanation including the missing precondition. */
  readonly reason: string;
}

/**
 * The shared gate decision contract (`GateVerdict { severity, ruleId,
 * claims, stateSnapshot }`) plus explainability fields. Consumed by the skip
 * interlock, narration framing and the audit log.
 */
export interface GateVerdict {
  /** Strongest finding severity; `allow` when nothing fired. */
  readonly severity: GateSeverity;
  /** Rule that produced {@link GateVerdict.severity}; `null` when allowed. */
  readonly ruleId: GateRuleId | null;
  /** All claims extracted from the message. */
  readonly claims: readonly ExtractedClaim[];
  /** Ground-truth state the rules checked against. */
  readonly stateSnapshot: ActorStateSnapshot;
  /** Every violation, strongest first. */
  readonly findings: readonly GateFinding[];
  /** Engine attribution (audit requirement): the deterministic engine, or the deterministic engine with an opt-in LLM downgrade applied. */
  readonly engine: "deterministic" | "deterministic+llm-downgrade";
}

/** Per-rule configuration: toggle + severity override. */
export interface ImmersionRuleConfig {
  readonly enabled: boolean;
  readonly severity: GateSeverity;
}

/** Gate configuration (per-chat surface lands with WI-6). */
export interface ImmersionGateConfig {
  readonly rules: Readonly<Record<GateRuleId, ImmersionRuleConfig>>;
}

/**
 * Default rule configuration. The deterministic default path stays annotate
 * (AC: captive "I sprint away" triggers ≥ annotate); per-chat config may
 * raise or lower individual rules.
 */
export const DEFAULT_IMMERSION_CONFIG: ImmersionGateConfig = {
  rules: {
    [GateRuleId.MovementWhileRestrained]: { enabled: true, severity: GateSeverity.Annotate, },
    [GateRuleId.SkillNotOwned]: { enabled: true, severity: GateSeverity.Annotate, },
    [GateRuleId.ItemNotInInventory]: { enabled: true, severity: GateSeverity.Annotate, },
    [GateRuleId.PendingFailedCheck]: { enabled: true, severity: GateSeverity.Annotate, },
  },
};

/** Input to a single gate evaluation. */
export interface GateInput {
  readonly chatId: string;
  readonly actorId: string;
  /** `null` when the chat has no world context (inventory checks skipped). */
  readonly worldId: string | null;
  /** The actor message text to analyze. */
  readonly content: string;
}

/** Hard cap on extracted claims per message (bounded extraction). */
export const MAX_CLAIMS_PER_MESSAGE = 20;
