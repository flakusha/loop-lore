/**
 * DB Schema — RPG Tables
 *
 * Dice roll history, character stat blocks, XP tracking.
 */
import type { Generated, } from "kysely";

// ── Dice Roll History ────────────────────────────────────────

/** Logged dice roll for audit, replay, and statistics */
export interface DiceRollHistory {
  id: Generated<string>;
  /** User who initiated the roll */
  user_id: string;
  /** Chat context (null for system rolls) */
  chat_id: string | null;
  /** Actor performing the roll (null for GM/system) */
  actor_id: string | null;
  /** Die type (4, 6, 8, 10, 12, 20, 100) */
  sides: number;
  /** Number of dice rolled */
  count: number;
  /** Flat modifier applied */
  modifier: number;
  /** Advantage mode: normal, advantage, disadvantage */
  advantage_mode: string;
  /** Whether dice were exploding */
  exploding: Generated<number>;
  /** Raw die values as JSON array, e.g. [14, 7] */
  raw_rolls: string;
  /** Sum of raw rolls */
  raw_total: number;
  /** Final total after modifier */
  total: number;
  /** Purpose/context of the roll (e.g. "attack", "skill_check", "initiative") */
  purpose: string | null;
  /** Created timestamp */
  created_at: Generated<string>;
}

// ── Character Stat Blocks ────────────────────────────────────

/** RPG stat block for a character/NPC */
export interface CharacterStats {
  id: Generated<string>;
  /** Actor (character/NPC) this stat block belongs to */
  actor_id: string;
  /** Character level */
  level: Generated<number>;
  /** Hit points current */
  hp: number;
  /** Hit points maximum */
  max_hp: number;
  /** Temporary hit points */
  temp_hp: Generated<number>;
  /** Mana/spell points */
  mp: Generated<number>;
  /** Maximum mana */
  max_mp: Generated<number>;
  /** Armor class */
  ac: number;
  /** Speed (feet) */
  speed: Generated<number>;
  /** Strength score */
  str: number;
  /** Dexterity score */
  dex: number;
  /** Constitution score */
  con: number;
  /** Intelligence score */
  int: number;
  /** Wisdom score */
  wis: number;
  /** Charisma score */
  cha: number;
  /** Hit dice remaining (JSON: {"4": 2, "8": 3}) */
  hit_dice: Generated<string>;
  /** Death save successes */
  death_save_successes: Generated<number>;
  /** Death save failures */
  death_save_failures: Generated<number>;
  /** XP current */
  xp: Generated<number>;
  /** XP to next level */
  xp_to_next: Generated<number>;
  /** Data version for optimistic concurrency */
  data_version: Generated<number>;
  /** Created timestamp */
  created_at: Generated<string>;
  /** Updated timestamp */
  updated_at: Generated<string>;
}

// ── XP Ledger ────────────────────────────────────────────────

/** Experience point transactions */
export interface XpLedger {
  id: Generated<string>;
  actor_id: string;
  /** XP amount (positive = gain, negative = loss) */
  amount: number;
  /** Source of XP (e.g. "combat", "quest", "skill_use") */
  source: string;
  /** Description of what earned/lost XP */
  description: string | null;
  /** Related entity (e.g. quest_id, enemy_id) */
  reference_id: string | null;
  /** Chat context */
  chat_id: string | null;
  created_at: Generated<string>;
}

// ── Loot Drops ───────────────────────────────────────────────

/** Loot table definition */
export interface LootTables {
  id: Generated<string>;
  /** Loot table name */
  name: string;
  /** Source type (e.g. "enemy", "chest", "quest") */
  source_type: string;
  /** Source ID (enemy type, chest type, quest ID) */
  source_id: string | null;
  /** Total weight of all entries (for probability calculation) */
  total_weight: number;
  /** Whether this table has been rolled at least once */
  used: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

/** Individual loot table entry */
export interface LootEntries {
  id: Generated<string>;
  loot_table_id: string;
  /** Item name */
  item_name: string;
  /** Item description */
  description: string | null;
  /** Item type (weapon, armor, consumable, etc.) */
  item_type: string;
  /** Rarity: common, uncommon, rare, legendary, artifact */
  rarity: string;
  /** Drop weight (higher = more likely) */
  weight: number;
  /** Minimum quantity */
  min_quantity: Generated<number>;
  /** Maximum quantity */
  max_quantity: Generated<number>;
  /** Required character level to drop */
  min_level: Generated<number>;
  /** Item metadata as JSON */
  metadata: Generated<string>;
  created_at: Generated<string>;
}
