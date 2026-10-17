// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/karma-tiers.ts — the pure half of the karma/standing
 * surface: tier bands and the effect data they unlock.
 *
 * No database, no imports from combat or economy — `buildStandingEffects`
 * returns typed RECORDS for those systems to consume. They decide what a
 * standing means; nothing here prices or fights anything.
 *
 * Bands are inclusive at their floor: a score exactly on the threshold
 * belongs to the HIGHER tier (80 is `exalted`, 79 is `revered`).
 */
import { FactionError, } from "./factions";

/** How a faction regards an actor, coarse enough to gate content. */
export const StandingTier = {
  Exalted: "exalted",
  Revered: "revered",
  Honored: "honored",
  Friendly: "friendly",
  Neutral: "neutral",
  Unfriendly: "unfriendly",
  Hostile: "hostile",
} as const;
/** */
export type StandingTier = (typeof StandingTier)[keyof typeof StandingTier];

/** Overall karma band an actor has earned. */
export const KarmaTier = {
  Saint: "saint",
  Hero: "hero",
  Neutral: "neutral",
  Villain: "villain",
  Tyrant: "tyrant",
} as const;
/** */
export type KarmaTier = (typeof KarmaTier)[keyof typeof KarmaTier];

/** Inclusive score floor of each standing tier. */
export const STANDING_TIER_THRESHOLDS: Readonly<Record<StandingTier, number>> = {
  exalted: 80,
  revered: 60,
  honored: 40,
  friendly: 20,
  neutral: -20,
  unfriendly: -60,
  hostile: -100,
};

/** Inclusive score floor of each karma tier. */
export const KARMA_TIER_THRESHOLDS: Readonly<Record<KarmaTier, number>> = {
  saint: 60,
  hero: 20,
  neutral: -20,
  villain: -60,
  tyrant: -100,
};

/** Standing tiers from best to worst, for at-least comparisons. */
const STANDING_ORDER: readonly StandingTier[] = [
  StandingTier.Exalted,
  StandingTier.Revered,
  StandingTier.Honored,
  StandingTier.Friendly,
  StandingTier.Neutral,
  StandingTier.Unfriendly,
  StandingTier.Hostile,
];

/**
 * Clamp a score into the -100..100 range every band is defined over.
 * @param value raw score
 * @returns the bounded score
 */
export function clampScore(value: number,): number {
  return Math.max(-100, Math.min(100, value,),);
}

/**
 * @param params standing faction standing score
 * @returns the tier whose floor the score reaches
 */
export function computeStandingTier(params: { standing: number },): StandingTier {
  const standing = clampScore(params.standing,);
  for (const tier of STANDING_ORDER) {
    if (standing >= STANDING_TIER_THRESHOLDS[tier]) { return tier; }
  }

  return StandingTier.Hostile;
}

/**
 * @param params overall actor karma score
 * @returns the karma tier whose floor the score reaches
 */
export function computeKarmaTier(params: { overall: number },): KarmaTier {
  const overall = clampScore(params.overall,);
  if (overall >= KARMA_TIER_THRESHOLDS.saint) { return KarmaTier.Saint; }
  if (overall >= KARMA_TIER_THRESHOLDS.hero) { return KarmaTier.Hero; }
  if (overall >= KARMA_TIER_THRESHOLDS.neutral) { return KarmaTier.Neutral; }
  if (overall >= KARMA_TIER_THRESHOLDS.villain) { return KarmaTier.Villain; }

  return KarmaTier.Tyrant;
}

/**
 * @param tier tier to test
 * @param minimum tier that would satisfy the requirement
 * @returns true when `tier` ranks at or above `minimum`
 */
export function standingTierSatisfies(tier: StandingTier, minimum: StandingTier,): boolean {
  return STANDING_ORDER.indexOf(tier,) <= STANDING_ORDER.indexOf(minimum,);
}

/** A faction-gated item rule (`item_access` effect data). */
export interface StandingItemAccess {
  itemTag: string;
  requiredTier: StandingTier;
  /** Whether the actor's current standing opens this item. */
  granted: boolean;
}

/** Shop price skew for a standing band (`price_modifier` effect data). */
export interface StandingPriceModifier {
  /** Percent added to what the actor pays. */
  buyPercent: number;
  /** Percent added to what the actor is paid. */
  sellPercent: number;
}

/** A faction-gated quest rule (`quest_availability` effect data). */
export interface StandingQuestAvailability {
  questTag: string;
  requiredTier: StandingTier;
  /** Whether the actor's current standing offers this quest. */
  available: boolean;
}

/** Everything a standing unlocks, as plain data. */
export interface StandingEffects {
  tier: StandingTier;
  itemAccess: StandingItemAccess[];
  priceModifier: StandingPriceModifier;
  quests: StandingQuestAvailability[];
}

/** Item rules by required tier. */
const ITEM_RULES: ReadonlyArray<readonly [string, StandingTier,]> = [
  ["faction_trade_goods", StandingTier.Friendly,],
  ["faction_rare_goods", StandingTier.Honored,],
  ["faction_relic", StandingTier.Revered,],
];

/** Quest rules by required tier. */
const QUEST_RULES: ReadonlyArray<readonly [string, StandingTier,]> = [
  ["faction_errand", StandingTier.Friendly,],
  ["faction_crusade", StandingTier.Honored,],
];

/** Buy/sell skew per standing tier. */
const PRICE_BY_TIER: Readonly<Record<StandingTier, StandingPriceModifier>> = {
  exalted: { buyPercent: -20, sellPercent: 20, },
  revered: { buyPercent: -10, sellPercent: 10, },
  honored: { buyPercent: -5, sellPercent: 5, },
  friendly: { buyPercent: 0, sellPercent: 0, },
  neutral: { buyPercent: 0, sellPercent: 0, },
  unfriendly: { buyPercent: 10, sellPercent: -5, },
  hostile: { buyPercent: 25, sellPercent: -10, },
};

/**
 * What a faction standing opens up. Data only — the economy and quest
 * systems read these records; nothing here calls into them.
 * @param params standing score to evaluate
 * @returns item access, price modifier, and quest availability records
 */
export function buildStandingEffects(params: { standing: number },): StandingEffects {
  const tier = computeStandingTier(params,);

  return {
    tier,
    itemAccess: ITEM_RULES.map((rule,) => ({
      itemTag: rule[0],
      requiredTier: rule[1],
      granted: standingTierSatisfies(tier, rule[1],),
    })),
    priceModifier: PRICE_BY_TIER[tier],
    quests: QUEST_RULES.map((rule,) => ({
      questTag: rule[0],
      requiredTier: rule[1],
      available: standingTierSatisfies(tier, rule[1],),
    })),
  };
}

/** A free-jump price tag's faction gate, parsed (`location_edges.cost_json`). */
export interface FactionStandingRequirement {
  factionId: string;
  /** Minimum standing tier the traveler must hold with that faction. */
  tier: StandingTier;
}

/**
 * Parse the `requiresFactionStanding` string of a free-jump cost tag
 * (`location_edges.cost_json`, 053), form `"<factionId>:<tier>"`.
 * @param raw the stored cost value
 * @returns the faction and minimum tier it demands
 * @throws {FactionError} invalid-input on a malformed tag or unknown tier
 */
export function parseFactionStandingRequirement(raw: string,): FactionStandingRequirement {
  const separator = raw.lastIndexOf(":",);
  const factionId = separator === -1 ? "" : raw.slice(0, separator,);
  const tierName = separator === -1 ? raw : raw.slice(separator + 1,);

  if (factionId.length === 0) {
    throw new FactionError("invalid-input", `requiresFactionStanding "${raw}" has no faction id`,);
  }

  const tier = STANDING_ORDER.find((entry,) => entry === tierName);
  if (!tier) {
    throw new FactionError("invalid-input", `unknown standing tier "${tierName}"`,);
  }

  return { factionId, tier, };
}
