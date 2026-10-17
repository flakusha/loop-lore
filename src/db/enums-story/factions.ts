// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Factions, diplomacy, and karma enums (migration 062).
 *
 * Deliberately separate from the per-actor-pair `character_relationships`
 * scores (001) and the NSFW-gated `src/rpg/reputation.ts`: those measure
 * something else. These describe WORLD-level factions and the karma a
 * single actor accrues in a world.
 */

/** Moral compass of a faction (nine-fold alignment). */
export const FactionAlignment = {
  LawfulGood: "lawful_good",
  NeutralGood: "neutral_good",
  ChaoticGood: "chaotic_good",
  LawfulNeutral: "lawful_neutral",
  TrueNeutral: "true_neutral",
  ChaoticNeutral: "chaotic_neutral",
  LawfulEvil: "lawful_evil",
  NeutralEvil: "neutral_evil",
  ChaoticEvil: "chaotic_evil",
} as const;
/** */
export type FactionAlignment = (typeof FactionAlignment)[keyof typeof FactionAlignment];

/** Position of an actor inside a faction (`faction_memberships.role`). */
export const FactionRole = {
  Leader: "leader",
  Officer: "officer",
  Member: "member",
  Ally: "ally",
} as const;
/** */
export type FactionRole = (typeof FactionRole)[keyof typeof FactionRole];

/**
 * Diplomatic state of a faction pair (`faction_relationships.status`).
 * `AtWar` is a state like any other, not a modifier — war is ended by a
 * peace negotiation, never by editing the row.
 */
export const FactionDiplomaticStatus = {
  Allied: "allied",
  Friendly: "friendly",
  Neutral: "neutral",
  Unfriendly: "unfriendly",
  Hostile: "hostile",
  AtWar: "at_war",
} as const;
/** */
export type FactionDiplomaticStatus = (typeof FactionDiplomaticStatus)[keyof typeof FactionDiplomaticStatus];

/**
 * Ledger categories an actor's karma is tracked under
 * (`karma_events.category`, and the keys of `karma_profiles.categories`).
 */
export const KarmaCategory = {
  Honor: "honor",
  Mercy: "mercy",
  Justice: "justice",
  Craft: "craft",
  Greed: "greed",
  Cruelty: "cruelty",
  Treachery: "treachery",
  Piety: "piety",
} as const;
/** */
export type KarmaCategory = (typeof KarmaCategory)[keyof typeof KarmaCategory];
