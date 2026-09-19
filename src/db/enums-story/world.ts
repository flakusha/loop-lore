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
/** */
export type WorldEventType = (typeof WorldEventType)[keyof typeof WorldEventType];

// ── Memory ───────────────────────────────────────────────
export const MemoryType = {
  Episodic: "episodic",
  Semantic: "semantic",
  Procedural: "procedural",
} as const;
/** */
export type MemoryType = (typeof MemoryType)[keyof typeof MemoryType];

// ── Memory extraction provenance ───────────────────────────
/** How a memory was formed (008_memory_source_chain.extraction_kind). */
export const ExtractionKind = {
  SingleResponse: "single_response",
  Burst: "burst",
  Compaction: "compaction",
  Manual: "manual",
  CarryForward: "carry_forward",
} as const;
/** */
export type ExtractionKind = (typeof ExtractionKind)[keyof typeof ExtractionKind];

// ── Lorebook ──────────────────────────────────────────────
export const LorePosition = {
  BeforeChar: "before_char",
  AfterChar: "after_char",
  InChar: "in_char",
} as const;
/** */
export type LorePosition = (typeof LorePosition)[keyof typeof LorePosition];

export const LoreEntryStatus = {
  Enabled: "enabled",
  Disabled: "disabled",
  Archived: "archived",
} as const;
/** */
export type LoreEntryStatus = (typeof LoreEntryStatus)[keyof typeof LoreEntryStatus];

// ── World Difficulty ──────────────────────────────────────
export const DifficultyReroll = {
  None: "none",
  PerTurn: "per_turn",
  PerQuest: "per_quest",
} as const;
/** */
export type DifficultyReroll = (typeof DifficultyReroll)[keyof typeof DifficultyReroll];

export const DifficultyState = {
  Normal: "normal",
  Hard: "hard",
  Extreme: "extreme",
  Custom: "custom",
} as const;
/** */
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
/** */
export type QualityDimension = (typeof QualityDimension)[keyof typeof QualityDimension];

/**
 * World mode — 'rpg' uses locations as a travel graph (current_location_id moves);
 * 'chat' uses locations as channels (current_location_id is a static binding).
 */
export const WorldKind = {
  Rpg: "rpg",
  Chat: "chat",
} as const;
/** */
export type WorldKind = (typeof WorldKind)[keyof typeof WorldKind];

/**
 * World visibility (single-server model — no federation, no per-channel ACLs).
 * 'public' = any authenticated user, 'unlisted' = owner + world members (not listed),
 * 'private' = owner + world members.
 */
export const WorldVisibility = {
  Public: "public",
  Unlisted: "unlisted",
  Private: "private",
} as const;
/** */
export type WorldVisibility = (typeof WorldVisibility)[keyof typeof WorldVisibility];

// ── Fractal Locations (TASK-locations-fractal-migration) ────────────
/**
 * LocationKind — fractal hierarchy discriminator.
 * `region` = continent/country/biome (top level).
 * `settlement` = city/village/outpost.
 * `building` = tavern/fortress/inn.
 * `room` = interior leaf (cabin, bedroom, vault).
 * `transit` = dock/station/platform (route endpoint).
 * `transport` = mobile carrier (ship, caravan, airship) that contains rooms.
 * `pocket` = extradimensional/demiplane (special containment).
 */
export const LocationKind = {
  Region: "region",
  Settlement: "settlement",
  Building: "building",
  Room: "room",
  Transit: "transit",
  Transport: "transport",
  Pocket: "pocket",
} as const;
/** */
export type LocationKind = (typeof LocationKind)[keyof typeof LocationKind];

/**
 * MobilityMode — does a location move between stops?
 * `static` = fixed (regions, buildings, rooms).
 * `free` = moves along a travel route (ships, caravans, airships).
 * `anchored` = parked/docked (transport currently not en-route).
 */
export const MobilityMode = {
  Static: "static",
  Free: "free",
  Anchored: "anchored",
} as const;
/** */
export type MobilityMode = (typeof MobilityMode)[keyof typeof MobilityMode];

/**
 * TransportKind — flavor for the route a transport follows.
 * `sea` = oceanic/blue-water routes.
 * `road` = overland routes (roads, trails).
 * `air` = aerial routes (airships, flying mounts).
 * `custom` = world-specific (subterranean, planar, etc.).
 */
export const TransportKind = {
  Sea: "sea",
  Road: "road",
  Air: "air",
  Custom: "custom",
} as const;
/** */
export type TransportKind = (typeof TransportKind)[keyof typeof TransportKind];

/**
 * Fractal location depth limit. A location's depth = number of '/' separators
 * in its materialized path (root has depth 1, child of root has depth 2, etc.).
 * Enforced at the application layer in LocationTreeService.insertLocation.
 */
export const LOCATION_DEPTH_LIMIT = 12;
