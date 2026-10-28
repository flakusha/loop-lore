// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Consistency Gate — Public API
 *
 * Pre-generation fictional-consistency gate (epic-immersion-consistency-gate).
 * Independent from content-policy moderation (`src/nsfw/`). Consumed by the
 * generation pipeline; verdicts feed the skip interlock, narration framing
 * and the decision-log audit.
 *
 * @module immersion
 */
export { createImmersionGate, } from "./engine";
export type { ImmersionGate, ImmersionGateDeps, PendingConsequenceLoader, } from "./engine";
export { extractClaims, } from "./extract-claims";
export { evaluateRules, } from "./rules";
export { buildActorStateSnapshot, deriveRestricted, } from "./state-snapshot";
export {
  DEFAULT_IMMERSION_CONFIG,
  downgradeSeverity,
  GATE_RULE_ORDER,
  GateRuleId,
  GateSeverity,
  MAX_CLAIMS_PER_MESSAGE,
  maxSeverity,
  severityRank,
} from "./types";
export type {
  ActionClaim,
  ActorStateSnapshot,
  ClaimKind,
  ExtractedClaim,
  GateFinding,
  GateInput,
  GateVerdict,
  ImmersionGateConfig,
  ImmersionRuleConfig,
  ItemAction,
  ItemClaim,
  MovementClaim,
  PendingConsequence,
  SkillClaim,
} from "./types";
