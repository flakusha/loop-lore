// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth & Arc Progression — public type contracts.
 *
 * See `.plan/epics/epic-character-growth.md` for the design. This file
 * holds the **stable, runtime-agnostic** types only. Migration /
 * persistence types live in the regenerated schema files; service
 * implementations live in `services/growth-service/`.
 *
 * Importing from `db/schema` here would violate the "services must not
 * import DB modules" rule from AGENTS.md — keep this file a pure type
 * module so it can be consumed by services, validators, and prompts
 * without dragging in Kysely types.
 */

// ── Growth mode (per-character author toggle) ──────────────────────

/** Author toggle controlling whether the character evolves through the story. */
export const GrowthMode = {
  /** Default. Service accepts growth_log writes for arc/skill/trait/relationship events. */
  Dynamic: "dynamic",
  /** "Wise sage who never changes". Service refuses mutations except author-only `arc_stage_set`. */
  Static: "static",
} as const;
/** */
export type GrowthMode = (typeof GrowthMode)[keyof typeof GrowthMode];

// ── Arc stages ─────────────────────────────────────────────────────

export const ArcStage = {
  Introduction: "introduction",
  RisingAction: "rising_action",
  Crisis: "crisis",
  Resolution: "resolution",
  Epilogue: "epilogue",
} as const;
/** */
export type ArcStage = (typeof ArcStage)[keyof typeof ArcStage];

// ── Growth axes ────────────────────────────────────────────────────

export const GrowthAxis = {
  Arc: "arc",
  Skill: "skill",
  Trait: "trait",
  Relationship: "relationship",
} as const;
/** */
export type GrowthAxis = (typeof GrowthAxis)[keyof typeof GrowthAxis];

// ── Growth event types ─────────────────────────────────────────────

export const GrowthEventType = {
  /** Author/GM directly set the arc stage. */
  ArcStageSet: "arc_stage_set",
  /** LLM-assist pass proposed an arc stage transition (status='pending' until confirmed). */
  ArcStageProposed: "arc_stage_proposed",
  /** Story-driven skill acquisition (acquisition_source='story'). */
  SkillAcquired: "skill_acquired",
  /** Trait drift on a social/world trait that integrity approved. */
  TraitDrifted: "trait_drifted",
  /** Relationship strength/type transition. */
  RelationshipShifted: "relationship_shifted",
  /** LLM-assist observation with no state change (status='applied' immediately). */
  Observation: "observation",
} as const;
/** */
export type GrowthEventType = (typeof GrowthEventType)[keyof typeof GrowthEventType];

// ── Growth entry status ────────────────────────────────────────────

export const GrowthEntryStatus = {
  /** LLM-assist proposed, awaiting author/GM confirmation. */
  Pending: "pending",
  /** Live in the ground-truth table. */
  Applied: "applied",
  /** Author/GM rejected the proposal. */
  Rejected: "rejected",
} as const;
/** */
export type GrowthEntryStatus = (typeof GrowthEntryStatus)[keyof typeof GrowthEntryStatus];

// ── Skill acquisition source ───────────────────────────────────────

export const SkillAcquisitionSource = {
  /** Config-seeded baseline skill (e.g. from CharacterTemplate.skills[]). Not a growth event. */
  Baseline: "baseline",
  /** Story-driven acquisition. Records a growth_log entry (axis='skill'). */
  Story: "story",
  /** Author/GM explicit grant (e.g. world setup). Not a growth event by default. */
  Config: "config",
} as const;
/** */
export type SkillAcquisitionSource =
  (typeof SkillAcquisitionSource)[keyof typeof SkillAcquisitionSource];

// ── Public data shapes ─────────────────────────────────────────────

/** Per-character current arc state. */
export interface CharacterArc {
  actorId: string;
  currentStage: ArcStage;
  stageDescription: string | null;
  updatedAt: string;
}

/** Append-only growth event row projection. */
export interface GrowthLogEntry {
  id: string;
  actorId: string;
  axis: GrowthAxis;
  eventType: GrowthEventType;
  status: GrowthEntryStatus;
  /** Optional reference to the subject row (skill id, trait id, relationship id). */
  subjectKind: string | null;
  subjectId: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  reason: string;
  sourceEventId: string | null;
  recordedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
}

/** Input shape for inserting a growth_log entry. */
export interface InsertGrowthLogInput {
  actorId: string;
  axis: GrowthAxis;
  eventType: GrowthEventType;
  status?: GrowthEntryStatus;
  subjectKind?: string | null;
  subjectId?: string | null;
  beforeJson?: string | null;
  afterJson?: string | null;
  reason?: string;
  sourceEventId?: string | null;
  confirmedBy?: string | null;
}

/** Input shape for upserting a character_arc row. */
export interface UpsertArcInput {
  actorId: string;
  currentStage: ArcStage;
  stageDescription?: string | null;
}
