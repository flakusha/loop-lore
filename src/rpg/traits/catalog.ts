// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { AbilityName, SkillName, } from "../stats/types.js";

/** Roll context a floor applies to */
export type RollContextKind = "attack" | "save" | "check";

/** Discriminated union of gameplay trait effects */
export type TraitEffect =
  | { readonly kind: "ability_bonus"; readonly ability: AbilityName; readonly bonus: number }
  | { readonly kind: "skill_bonus"; readonly skill: SkillName; readonly bonus: number }
  | { readonly kind: "roll_floor"; readonly context: RollContextKind; readonly floor: number }
  | { readonly kind: "save_proficiency"; readonly ability: AbilityName }
  | { readonly kind: "hp_bonus_per_level"; readonly bonus: number };

/** One gameplay trait entry */
export interface GameplayTrait {
  readonly id: string;
  readonly label: string;
  /** Worlds this trait applies to; "*" = universal */
  readonly worldIdScope: readonly string[] | "*";
  readonly effects: readonly TraitEffect[];
}

/** Frozen seed catalog covering every effect kind */
export const TRAIT_CATALOG: readonly GameplayTrait[] = Object.freeze([
  Object.freeze({
    id: "fast_reflexes",
    label: "Fast Reflexes",
    worldIdScope: "*",
    effects: Object.freeze([
      Object.freeze({ kind: "ability_bonus", ability: "dex", bonus: 1, } as const,),
    ],),
  },),
  Object.freeze({
    id: "innate_magic",
    label: "Innate Magic",
    worldIdScope: "*",
    effects: Object.freeze([
      Object.freeze({ kind: "ability_bonus", ability: "int", bonus: 1, } as const,),
    ],),
  },),
  Object.freeze({
    id: "swift_hands",
    label: "Swift Hands",
    worldIdScope: "*",
    effects: Object.freeze([
      Object.freeze({ kind: "skill_bonus", skill: "sleight_of_hand", bonus: 2, } as const,),
    ],),
  },),
  Object.freeze({
    id: "iron_will",
    label: "Iron Will",
    worldIdScope: "*",
    effects: Object.freeze([
      Object.freeze({ kind: "save_proficiency", ability: "wis", } as const,),
    ],),
  },),
  Object.freeze({
    id: "keen_observer",
    label: "Keen Observer",
    worldIdScope: "*",
    effects: Object.freeze([
      Object.freeze({ kind: "roll_floor", context: "check", floor: 5, } as const,),
    ],),
  },),
  Object.freeze({
    id: "shadow_step",
    label: "Shadow Step",
    worldIdScope: Object.freeze(["shadowfell",],) as readonly string[],
    effects: Object.freeze([
      Object.freeze({ kind: "skill_bonus", skill: "stealth", bonus: 3, } as const,),
    ],),
  },),
  Object.freeze({
    id: "sturdy_frame",
    label: "Sturdy Frame",
    worldIdScope: "*",
    effects: Object.freeze([
      Object.freeze({ kind: "hp_bonus_per_level", bonus: 2, } as const,),
    ],),
  },),
  Object.freeze({
    id: "silver_tongue",
    label: "Silver Tongue",
    worldIdScope: "*",
    effects: Object.freeze([
      Object.freeze({ kind: "skill_bonus", skill: "persuasion", bonus: 2, } as const,),
    ],),
  },),
] as GameplayTrait[],);

/**
 * Traits applying to a world (universal + scoped matches).
 * @param worldId
 * @returns {GameplayTrait[]}
 */
export function getTraitsForWorld(worldId: string,): GameplayTrait[] {
  return TRAIT_CATALOG.filter(
    (trait,) => trait.worldIdScope === "*" || trait.worldIdScope.includes(worldId,),
  );
}

/**
 * Fail-closed validator: throws on unknown trait id.
 * @param ids
 * @throws On unknown id
 * @returns {GameplayTrait[]}
 */
export function assertTraitIds(ids: readonly string[],): GameplayTrait[] {
  return ids.map((id,) => {
    const trait = TRAIT_CATALOG.find((entry,) => entry.id === id);
    if (trait === undefined) {
      throw new Error(`Unknown trait id: ${id}`,);
    }

    return trait;
  },);
}
