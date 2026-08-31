// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Combat Stats (Shared: Character Core, Items, Battle) ─────

/** Core combat statistics for a character/NPC */
export interface CombatStats {
  /** Character ID */
  characterId: string;
  /** Health points */
  health: number;
  /** Maximum health */
  maxHealth: number;
  /** Mana points */
  mana: number;
  /** Maximum mana */
  maxMana: number;
  /** Stamina points */
  stamina: number;
  /** Maximum stamina */
  maxStamina: number;
  /** Physical attack power */
  attack: number;
  /** Physical defense */
  defense: number;
  /** Magical attack power */
  magicAttack: number;
  /** Magical defense */
  magicDefense: number;
  /** Speed/agility */
  speed: number;
  /** Critical hit chance (0-100) */
  criticalChance: number;
  /** Dodge chance (0-100) */
  dodgeChance: number;
  /** Accuracy (0-100) */
  accuracy: number;
}

/** Equipment slot types */
export type EquipmentSlot =
  | "weapon"
  | "armor"
  | "helmet"
  | "boots"
  | "gloves"
  | "accessory"
  | "shield"
  | "ring"
  | "necklace";

/** Equipment stat modifier */
export interface EquipmentModifier {
  /** Stat being modified */
  stat: keyof CombatStats;
  /** Modifier value (positive = bonus, negative = penalty) */
  value: number;
  /** Condition for modifier to apply (optional) */
  condition?: string;
}

/**
 * Calculate effective combat stats with equipment modifiers
 * @param baseStats
 * @param modifiers
 */
export function calculateEffectiveStats(
  baseStats: CombatStats,
  modifiers: EquipmentModifier[],
): CombatStats {
  const effective = { ...baseStats, };

  for (const mod of modifiers) {
    if (mod.stat === "characterId") { continue; // Skip non-numeric fields
     }
    const currentValue = effective[mod.stat];
    if (typeof currentValue === "number") {
      (effective as Record<string, unknown>)[mod.stat] = currentValue + mod.value;
    }
  }

  // Clamp values
  effective.health = Math.max(0, Math.min(effective.maxHealth, effective.health,),);
  effective.mana = Math.max(0, Math.min(effective.maxMana, effective.mana,),);
  effective.stamina = Math.max(0, Math.min(effective.maxStamina, effective.stamina,),);
  effective.criticalChance = Math.max(0, Math.min(100, effective.criticalChance,),);
  effective.dodgeChance = Math.max(0, Math.min(100, effective.dodgeChance,),);
  effective.accuracy = Math.max(0, Math.min(100, effective.accuracy,),);

  return effective;
}
