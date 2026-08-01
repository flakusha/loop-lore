/**
 * DB Schema Enums — Story Domain
 *
 * Story turns, quests, world events, quality evaluation,
 * synthetic data, and item types.
 */

// ── Story Turns ───────────────────────────────────────────
// ── State Machine (used by story/synthetic/generator.ts) ────
import { createMachine, type StateDef, } from "./state";

export const TurnType = {
  CharacterAction: "character_action",
  Narration: "narration",
  GmInjection: "gm_injection",
  QuestUpdate: "quest_update",
  WorldEvent: "world_event",
} as const;
export type TurnType = (typeof TurnType)[keyof typeof TurnType];

export const TurnStatus = {
  Pending: "pending",
  Generating: "generating",
  Evaluating: "evaluating",
  Accepted: "accepted",
  Regenerating: "regenerating",
  Failed: "failed",
  Escalated: "escalated",
} as const;
export type TurnStatus = (typeof TurnStatus)[keyof typeof TurnStatus];

// ── Quests ────────────────────────────────────────────────
export const QuestType = {
  Time: "time",
  Collection: "collection",
  Destruction: "destruction",
  Rescue: "rescue",
  Discovery: "discovery",
  Social: "social",
  Composite: "composite",
} as const;
export type QuestType = (typeof QuestType)[keyof typeof QuestType];

export const QuestStatus = {
  Active: "active",
  Completed: "completed",
  Failed: "failed",
  Abandoned: "abandoned",
} as const;
export type QuestStatus = (typeof QuestStatus)[keyof typeof QuestStatus];

// ── State Machine ──────────────────────────────────────────

const questStatusDef: StateDef<QuestStatus> = {
  values: ["active", "completed", "failed", "abandoned",] as const,
  initial: "active",
  transitions: {
    active: ["completed", "failed", "abandoned",],
    completed: [],
    failed: [],
    abandoned: ["active",],
  },
  terminal: ["completed", "failed",],
};

export const questStatusMachine = createMachine(questStatusDef,);

// ── Quest Progress ────────────────────────────────────────
export const QuestProgressStatus = {
  Active: "active",
  Completed: "completed",
  Failed: "failed",
  Ignored: "ignored",
} as const;
export type QuestProgressStatus = (typeof QuestProgressStatus)[keyof typeof QuestProgressStatus];

// ── Synthetic Data ─────────────────────────────────────────
export const SyntheticDataType = {
  TurnSequence: "turn_sequence",
  QualityEvaluation: "quality_evaluation",
  QuestProgression: "quest_progression",
  WorldStateTransition: "world_state_transition",
  RegenerationCase: "regeneration_case",
  GmEscalation: "gm_escalation",
} as const;
export type SyntheticDataType = (typeof SyntheticDataType)[keyof typeof SyntheticDataType];

export const SyntheticDataStatus = {
  Generated: "generated",
  Validated: "validated",
  Approved: "approved",
  Rejected: "rejected",
  Archived: "archived",
} as const;
export type SyntheticDataStatus = (typeof SyntheticDataStatus)[keyof typeof SyntheticDataStatus];

export const SyntheticTestMode = {
  Replay: "replay",
  Mutation: "mutation",
  Regression: "regression",
  Calibration: "calibration",
  Stress: "stress",
} as const;
export type SyntheticTestMode = (typeof SyntheticTestMode)[keyof typeof SyntheticTestMode];

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

// ── Items ─────────────────────────────────────────────────
export const ItemCategory = {
  Weapon: "weapon",
  Armor: "armor",
  Consumable: "consumable",
  KeyItem: "key_item",
  QuestItem: "quest_item",
  Material: "material",
  Tool: "tool",
  Container: "container",
  Treasure: "treasure",
  Book: "book",
  Other: "other",
} as const;
export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory];

export const ItemRarity = {
  Common: "common",
  Uncommon: "uncommon",
  Rare: "rare",
  Epic: "epic",
  Legendary: "legendary",
  Unique: "unique",
} as const;
export type ItemRarity = (typeof ItemRarity)[keyof typeof ItemRarity];

export const ItemVisibility = {
  Visible: "visible",
  Hidden: "hidden",
} as const;
export type ItemVisibility = (typeof ItemVisibility)[keyof typeof ItemVisibility];

/** Publication lifecycle for generated/created entities (worlds, locations, items). */
export const PublicationStatus = {
  Draft: "draft",
  Review: "review",
  Published: "published",
  Rejected: "rejected",
  Archived: "archived",
} as const;
export type PublicationStatus = (typeof PublicationStatus)[keyof typeof PublicationStatus];

const publicationStatusDef: StateDef<PublicationStatus> = {
  values: ["draft", "review", "published", "rejected", "archived",] as const,
  initial: "draft",
  transitions: {
    draft: ["review", "published", "rejected",],
    review: ["published", "rejected",],
    published: ["archived", "rejected",],
    rejected: ["draft",],
    archived: [],
  },
  terminal: ["archived",],
};

export const publicationStatusMachine = createMachine(publicationStatusDef,);

const syntheticDataStatusDef: StateDef<SyntheticDataStatus> = {
  values: ["generated", "validated", "approved", "rejected", "archived",] as const,
  initial: "generated",
  transitions: {
    generated: ["validated", "rejected",],
    validated: ["approved", "rejected",],
    approved: ["archived",],
    rejected: ["generated",],
    archived: [],
  },
  terminal: ["archived",],
};

export const syntheticDataStatusMachine = createMachine(syntheticDataStatusDef,);
