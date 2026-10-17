// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB Schema Enums — NPC World (npc_memories, npc_relationships,
 * monster_templates, monster_spawns; migration 061).
 */

// `npc_memories.memory_type` reuses the existing `MemoryType` vocabulary
// (episodic | semantic | procedural) from ./world rather than minting a
// parallel set - see the `NpcMemories` entry in column-types-part2.ts.

// ── NPC Relationship ───────────────────────────────────────
/**
 * Derived band for an NPC's attitude toward one target. Computed by
 * `computeRelationshipType` (src/rpg/npc-memory) from standing + bond, not
 * stored independently by callers.
 */
export const NpcRelationshipType = {
  Stranger: "stranger",
  Acquaintance: "acquaintance",
  Friend: "friend",
  Ally: "ally",
  Rival: "rival",
  Enemy: "enemy",
} as const;
/** */
export type NpcRelationshipType = (typeof NpcRelationshipType)[keyof typeof NpcRelationshipType];

// ── Monster Template ───────────────────────────────────────
/** Broad bestiary taxonomy; `subcategory` on the row carries the detail. */
export const MonsterCategory = {
  Beast: "beast",
  Monstrosity: "monstrosity",
  Humanoid: "humanoid",
  Undead: "undead",
  Dragon: "dragon",
  Elemental: "elemental",
  Fiend: "fiend",
  Celestial: "celestial",
  Construct: "construct",
  Plant: "plant",
  Ooze: "ooze",
  Aberration: "aberration",
} as const;
/** */
export type MonsterCategory = (typeof MonsterCategory)[keyof typeof MonsterCategory];

/** Size band — feeds armour/hit-point scaling, not a numeric stat. */
export const MonsterSize = {
  Tiny: "tiny",
  Small: "small",
  Medium: "medium",
  Large: "large",
  Huge: "huge",
  Gargantuan: "gargantuan",
} as const;
/** */
export type MonsterSize = (typeof MonsterSize)[keyof typeof MonsterSize];

/**
 * Alignment as an attitude band rather than the full 3x3 grid — the moral /
 * lawful split is engine-side detail and not persisted here.
 */
export const MonsterAlignment = {
  Lawful: "lawful",
  Neutral: "neutral",
  Chaotic: "chaotic",
  Good: "good",
  Evil: "evil",
} as const;
/** */
export type MonsterAlignment = (typeof MonsterAlignment)[keyof typeof MonsterAlignment];

/** Encounter tuning band. Distinct from `DifficultyReroll`/`DifficultyState` (roll dials). */
export const MonsterDifficulty = {
  Trivial: "trivial",
  Easy: "easy",
  Standard: "standard",
  Hard: "hard",
  Deadly: "deadly",
} as const;
/** */
export type MonsterDifficulty = (typeof MonsterDifficulty)[keyof typeof MonsterDifficulty];
