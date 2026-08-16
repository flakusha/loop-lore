// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── World Events ──────────────────────────────────────────
export const WorldEventType = {
  LocationChange: "location_change",
  NpcStateChange: "npc_state_change",
  ItemTransfer: "item_transfer",
  TimeAdvancement: "time_advancement",
  LocationModification: "location_modification",
  WorldLoreUpdate: "world_lore_update",
  QuestProgress: "quest_progress",
  CombatEvent: "combat_event",
} as const;
export type WorldEventType = (typeof WorldEventType)[keyof typeof WorldEventType];

// ── Memory ───────────────────────────────────────────────
export const MemoryType = {
  Episodic: "episodic",
  Semantic: "semantic",
  Procedural: "procedural",
} as const;
export type MemoryType = (typeof MemoryType)[keyof typeof MemoryType];

// ── Lorebook ──────────────────────────────────────────────
export const LorePosition = {
  BeforeChar: "before_char",
  AfterChar: "after_char",
  InChar: "in_char",
} as const;
export type LorePosition = (typeof LorePosition)[keyof typeof LorePosition];

export const LoreEntryStatus = {
  Enabled: "enabled",
  Disabled: "disabled",
  Archived: "archived",
} as const;
export type LoreEntryStatus = (typeof LoreEntryStatus)[keyof typeof LoreEntryStatus];

// ── World Difficulty ──────────────────────────────────────
export const DifficultyReroll = {
  None: "none",
  PerTurn: "per_turn",
  PerQuest: "per_quest",
} as const;
export type DifficultyReroll = (typeof DifficultyReroll)[keyof typeof DifficultyReroll];

export const DifficultyState = {
  Normal: "normal",
  Hard: "hard",
  Extreme: "extreme",
  Custom: "custom",
} as const;
export type DifficultyState = (typeof DifficultyState)[keyof typeof DifficultyState];

// ── Quality Dimensions ────────────────────────────────────
export const QualityDimension = {
  CharacterVoice: "character_voice",
  PlotCoherence: "plot_coherence",
  LoreConsistency: "lore_consistency",
  NarrativeQuality: "narrative_quality",
  QuestRelevance: "quest_relevance",
  Creativity: "creativity",
} as const;
export type QualityDimension = (typeof QualityDimension)[keyof typeof QualityDimension];

/** World mode — 'rpg' uses locations as a travel graph (current_location_id moves);
 * 'chat' uses locations as channels (current_location_id is a static binding). */
export const WorldKind = {
  Rpg: "rpg",
  Chat: "chat",
} as const;
export type WorldKind = (typeof WorldKind)[keyof typeof WorldKind];

/** World visibility (single-server model — no federation, no per-channel ACLs).
 * 'public' = any authenticated user, 'unlisted' = owner + world members (not listed),
 * 'private' = owner + world members. */
export const WorldVisibility = {
  Public: "public",
  Unlisted: "unlisted",
  Private: "private",
} as const;
export type WorldVisibility = (typeof WorldVisibility)[keyof typeof WorldVisibility];
