/**
 * Battle Integration Module
 *
 * Equipment stats, durability, loot drops, social combat mechanics,
 * NPC AI, environmental modifiers, and unified dice resolution.
 *
 * Re-exports all battle integration subsystems for cross-system use.
 * Import from here: `import { ... } from "../battle"`
 */

// ── Schemas & Shared Types ────────────────────────────────────

export {
  applyMoraleModifier,
  calculateEffectiveStats,
  type CombatStats,
  type CombatWeather,
  computeMoraleLevel,
  createMoraleState,
  createStatusEffect,
  type DiceRoll,
  type DiceType,
  type DifficultyClass,
  type EnvironmentalModifier,
  type EquipmentModifier,
  type EquipmentSlot,
  getCombatTerrainModifiers,
  getCombatWeatherModifiers,
  isStatusEffectExpired,
  makeSkillCheck,
  type MoraleLevel,
  type MoraleModifier,
  type MoraleState,
  rollDice,
  type RollModifier,
  STANDARD_DC,
  type StatusEffect,
  type StatusEffectType,
  type TerrainType,
  tickStatusEffect,
} from "./integration-schemas";

// ── Items Integration ─────────────────────────────────────────

export {
  applyDurabilityDamage,
  calculateEquipmentModifiers,
  calculateSellPrice,
  calculateTotalWeight,
  canEquipItem,
  type EquipmentItem,
  generateLoot,
  getEquippedInSlot,
  getEquippedItems,
  type ItemQuality,
  type ItemType,
  type LootTableEntry,
  repairItem,
} from "./items-integration";

// ── NPC Integration ───────────────────────────────────────────

export {
  type BattleOutcome,
  createBattleMemory,
  getPersonalityMoraleModifier,
  makeNPCDecision,
  type NPCBattleMemory,
  type NPCCombatDecision,
  type NPCPersonality,
  shouldRememberBattle,
  wouldNPCSurrender,
} from "./npc-integration";

// ── Resolution Integration ────────────────────────────────────

export {
  type AttackRollResult,
  calculateDamage,
  type DamageResult,
  getCombatDC,
  makeAttackRoll,
  makeCombatSkillCheck,
  makeConcentrationCheck,
  makeDeathSavingThrow,
  makeInitiativeRoll,
  makeSavingThrow,
} from "./resolution-integration";

// ── Social Integration ────────────────────────────────────────

export {
  calculateDemoralizeEffect,
  calculateInspireEffect,
  calculateIntimidationEffect,
  calculateRallyEffect,
  calculateSurrenderChance,
  calculateTauntEffect,
  processMoraleBreak,
  type SocialCombatAction,
  type SocialCombatResult,
} from "./social-integration";

// ── Weather Integration ───────────────────────────────────────

export {
  applyEnvironmentalModifiers,
  type BattleTerrain,
  calculateCoverBonus,
  calculateElevationBonus,
  calculateVisibility,
  type CoverType,
  createBattleTerrain,
  type Elevation,
  type EnvironmentalHazard,
  generateEnvironmentalHazard,
  getEnvironmentalModifiers,
  isTerrainAffectedByWeather,
} from "./weather-integration";
