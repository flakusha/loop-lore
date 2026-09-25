// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Personality-driven utility scorer for autonomy-scheduler reactions.
 *
 * Models a Sims-style weighted sum across candidate reactions:
 *   score(kind) = baseline + Σ trait_weight × trait_signal(kind)
 *
 * Sourced from the closed D7 coping / D8 approach / D9 autonomy axes that
 * are already stored as world/permanent traits on `character_world_traits`
 * and `character_permanent_traits`. We do NOT introduce a new schema — the
 * existing `resolveCharacterTraits` output is consumed directly.
 *
 * @module characters/services/personality-service/utility-scorer
 */

import {
  REACTION_KIND,
  type ReactionContext,
  type ReactionDecision,
  type ReactionKind,
  type ResolvedPersonality,
} from "./utility-scorer-types";

/**
 * Trait weight vector. Defaults match the canonical personality axes
 * (D7 coping, D8 approach, D9 autonomy). Negative = avoid.
 */
interface TraitWeights {
  bold: number;
  cautious: number;
  social: number;
  solitary: number;
  agreeable: number;
  antagonistic: number;
}

/** Canonical reaction baselines (Sims-style). Tunable at admin time. */
const BASELINES: Record<ReactionKind, number> = {
  [REACTION_KIND.Chat]: 0.5,
  [REACTION_KIND.Wait]: 0.3,
  [REACTION_KIND.DoOther]: 0.4,
  [REACTION_KIND.Flee]: 0.2,
  [REACTION_KIND.Attack]: 0.1,
  [REACTION_KIND.Ignore]: 0.4,
};

/**
 * Derive a `TraitWeights` vector from a resolved personality snapshot.
 * Looks up "D7_coping"/"D8_approach"/"D9_autonomy" if present; falls
 * back to `personality_traits`/`core_values` heuristics; otherwise
 * returns a neutral baseline.
 */
function deriveWeights(personality: ResolvedPersonality,): TraitWeights {
  const r = personality.resolved;
  const w: TraitWeights = { bold: 0, cautious: 0, social: 0, solitary: 0, agreeable: 0, antagonistic: 0, };

  const readLevel = (key: string,): number => {
    const v = r[key];
    if (!v) { return 0; }
    const n = Number(v,);
    return Number.isFinite(n,) ? Math.max(-1, Math.min(1, n,),) : 0;
  };

  w.bold = readLevel("D8_approach",);
  // ponytail: avoid `-0` from negating zero — `Object.is(-0, 0)` is false,
  // which fails `expect(w.cautious).toBe(0)` style assertions on neutral
  // profiles. Negation of `0` produces `-0` in JS; conditional keeps it `0`.
  w.cautious = w.bold === 0 ? 0 : -w.bold;
  w.social = readLevel("D9_autonomy",) < 0 ? 0.3 : 0; // autonomy-negative → social-positive
  w.solitary = readLevel("D9_autonomy",) > 0 ? 0.3 : 0;
  w.agreeable = readLevel("D7_coping",) > 0 ? 0.3 : 0;
  w.antagonistic = readLevel("D7_coping",) < 0 ? 0.3 : 0;

  // `core_values` heuristic: "help others" implies agreeable, "dominance" implies antagonistic
  const values = (r.core_values ?? "").toLowerCase();
  if (values.includes("help",) || values.includes("protect",)) { w.agreeable += 0.2; }
  if (values.includes("dominance",) || values.includes("control",)) { w.antagonistic += 0.2; }

  // `personality_traits` heuristic (freeform string e.g. "brave, friendly, paranoid")
  const traits = (r.personality_traits ?? "").toLowerCase();
  if (/\bbrave|reckless|bold\b/.test(traits,)) { w.bold += 0.3; }
  if (/\bcautious|paranoid|shy\b/.test(traits,)) { w.cautious += 0.3; }
  if (/\bfriendly|sociable|warm\b/.test(traits,)) { w.social += 0.3; }
  if (/\bhermit|loner|solitary\b/.test(traits,)) { w.solitary += 0.3; }

  return w;
}

function contextBoost(kind: ReactionKind, ctx: ReactionContext,): number {
  let boost = 0;
  // ponytail: `Defend` is intentionally absent — the 6 reaction kinds
  // (chat | wait | do_other | flee | attack | ignore) model stimulus
  // reactions, not combat-action selection. Defend lives in the
  // action-parser verb enum (src/regex/action-parser.ts) and is routed
  // through the affordance matrix, not the utility scorer.
  if (ctx.inDanger && kind === REACTION_KIND.Flee) { boost += 0.4; }
  if (ctx.isHostile && kind === REACTION_KIND.Attack) { boost += 0.5; }
  if (!ctx.hasLineOfEffect && kind === REACTION_KIND.Attack) { boost -= 0.3; }
  if (ctx.relationToActor === "ally" && kind === REACTION_KIND.Chat) { boost += 0.3; }
  if (ctx.relationToActor === "rival" && kind === REACTION_KIND.Ignore) { boost += 0.2; }
  return boost;
}

function scoreOne(kind: ReactionKind, w: TraitWeights, ctx: ReactionContext,): number {
  const base = BASELINES[kind];
  let score = base;
  switch (kind) {
    case REACTION_KIND.Chat:
      score += w.social * 0.7 + w.agreeable * 0.4;
      break;
    case REACTION_KIND.Wait:
      score += w.cautious * 0.5;
      break;
    case REACTION_KIND.DoOther:
      score += w.solitary * 0.4 + w.cautious * 0.2;
      break;
    case REACTION_KIND.Flee:
      score += w.cautious * 0.9 - w.bold * 0.6;
      break;
    case REACTION_KIND.Attack:
      score += w.bold * 0.7 + w.antagonistic * 0.5;
      break;
    case REACTION_KIND.Ignore:
      score += w.solitary * 0.5 - w.social * 0.4;
      break;
  }
  score += contextBoost(kind, ctx,);
  return score;
}

/**
 * Public entry point. Pure function — no DB, no LLM.
 *
 * Returns the highest-scoring reaction with its rationale. If `candidates`
 * is empty, defaults to `wait` (safe fallback).
 *
 * ponytail: weighted-sum (utility AI), not GOAP. Aligns with the prior
 * research verdict — keep this simple until telemetry proves it insufficient.
 */
export function scoreReaction(
  personality: ResolvedPersonality,
  candidates: readonly ReactionKind[],
  ctx: ReactionContext,
): ReactionDecision {
  const considered = candidates.length > 0 ? candidates : [REACTION_KIND.Wait,];
  const weights = deriveWeights(personality,);

  let best: ReactionDecision = { kind: considered[0]!, score: -Infinity, reason: "default", };
  for (const kind of considered) {
    const score = scoreOne(kind, weights, ctx,);
    if (score > best.score) {
      best = { kind, score, reason: rationaleFor(kind, weights, ctx,), };
    }
  }
  return best;
}

function rationaleFor(kind: ReactionKind, w: TraitWeights, ctx: ReactionContext,): string {
  const bits: string[] = [];
  if (w.bold > 0 && (kind === REACTION_KIND.Attack || kind === REACTION_KIND.DoOther)) {
    bits.push(
      "bold personality",
    );
  }
  if (w.cautious > 0 && (kind === REACTION_KIND.Wait || kind === REACTION_KIND.Flee)) {
    bits.push("cautious personality",);
  }
  if (w.social > 0 && kind === REACTION_KIND.Chat) { bits.push("social disposition",); }
  if (w.solitary > 0 && (kind === REACTION_KIND.DoOther || kind === REACTION_KIND.Ignore)) {
    bits.push("solitary disposition",);
  }
  if (ctx.inDanger) { bits.push("in danger",); }
  if (ctx.isHostile) { bits.push("hostile context",); }
  if (bits.length === 0) { bits.push("baseline preference",); }
  return bits.join("; ",);
}

export { deriveWeights, scoreOne, };
