import { type DiceRollResult, } from "../dice.js";
import { type StatBlock, } from "../stats.js";

// ── Types ────────────────────────────────────────────────

/** Combatant in a fight */
export interface Combatant {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Current HP */
  hp: number;
  /** Maximum HP */
  maxHp: number;
  /** Armor class */
  ac: number;
  /** Ability scores */
  stats: StatBlock;
  /** Character level (for proficiency bonus) */
  level: number;
  /** Whether this combatant is an NPC/enemy */
  isNpc: boolean;
  /** Initiative score (set at combat start) */
  initiative: number;
  /** Initiative modifier (DEX mod) */
  initiativeMod: number;
  /** Whether this combatant has acted this round */
  hasActed: boolean;
  /** Actions remaining this turn */
  actions: number;
  /** Bonus actions remaining */
  bonusActions: number;
  /** Reactions available */
  reactions: number;
  /** Conditions (e.g. "stunned", "frightened") */
  conditions: string[];
}

/** Action types in combat */
export const ActionType = {
  Attack: "attack",
  CastSpell: "cast_spell",
  UseItem: "use_item",
  Dash: "dash",
  Disengage: "disengage",
  Dodge: "dodge",
  Help: "help",
  Hide: "hide",
  Ready: "ready",
  Grapple: "grapple",
  Shove: "shove",
  BonusAction: "bonus_action",
  Reaction: "reaction",
  FreeAction: "free_action",
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];

/** Result of an attack roll */
export interface AttackResult {
  /** The attack roll */
  roll: DiceRollResult;
  /** Total attack value (roll + STR/DEX mod + proficiency) */
  total: number;
  /** Whether the attack hits */
  hit: boolean;
  /** Whether it's a critical hit (natural 20) */
  criticalHit: boolean;
  /** Whether it's a critical miss (natural 1) */
  criticalMiss: boolean;
  /** Damage dealt (null if miss) */
  damage: DamageResult | null;
  /** Narration of the attack */
  narration: string;
}

/** Damage calculation result */
export interface DamageResult {
  /** Base weapon/spell damage dice */
  baseDice: DiceRollResult;
  /** Ability modifier added to damage */
  abilityMod: number;
  /** Additional flat damage (e.g. from features) */
  flatBonus: number;
  /** Total damage before resistance/vulnerability */
  totalBeforeResist: number;
  /** Final damage after resistances */
  finalDamage: number;
  /** Damage type */
  damageType: DamageType;
  /** Whether this was critical damage (extra dice) */
  isCritical: boolean;
}

/** Damage types */
export type DamageType =
  | "physical"
  | "fire"
  | "ice"
  | "lightning"
  | "thunder"
  | "poison"
  | "acid"
  | "psychic"
  | "necrotic"
  | "radiant"
  | "force"
  | "healing";

/** Damage resistance/vulnerability */
export const DamageModifier = {
  Resistant: "resistant",
  Vulnerable: "vulnerable",
  Immune: "immune",
} as const;
export type DamageModifier = (typeof DamageModifier)[keyof typeof DamageModifier];

export interface DamageResistance {
  type: DamageType;
  /** "resistant" = half damage, "vulnerable" = double, "immune" = zero */
  modifier: DamageModifier;
}

/** Initiative roll result */
export interface InitiativeResult {
  /** The d20 roll */
  roll: number;
  /** DEX modifier */
  dexMod: number;
  /** Total initiative score */
  total: number;
}

/** Combat round result */
export interface RoundResult {
  /** Round number */
  round: number;
  /** Initiative order for this round */
  initiativeOrder: string[];
  /** Actions taken this round */
  actions: CombatAction[];
  /** Whether combat is over */
  combatOver: boolean;
  /** Winner (if combat ended) */
  winner: "player" | "enemy" | null;
}

/** Action taken in combat */
export interface CombatAction {
  /** Actor ID */
  actorId: string;
  /** Action type */
  type: ActionType;
  /** Target ID (if any) */
  targetId?: string;
  /** Attack result (if attack action) */
  attack?: AttackResult;
  /** Damage dealt */
  damage?: number;
  /** Description */
  description: string;
}
