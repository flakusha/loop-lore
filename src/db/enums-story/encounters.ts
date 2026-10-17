// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB Schema Enums — Encounters & Anomalies (migration 059)
 *
 * Separate from ./world.ts because the anomaly/encounter enums are a
 * different domain slice: epic-world-encounters owns them, and the world
 * module should not grow a dependency on it.
 */

/**
 * AnomalyType — the flavor axis of a `location_anomalies` row.
 *
 * 'positive' anomalies are boon-flavored, 'negative' are curse/hazard
 * flavored, 'neutral' is a wild-card the GM reads without a moral lean.
 */
export const AnomalyType = {
  Positive: "positive",
  Negative: "negative",
  Neutral: "neutral",
} as const;
/** */
export type AnomalyType = (typeof AnomalyType)[keyof typeof AnomalyType];

/**
 * AnomalyInteraction — whether an anomaly must be interacted with before
 * its effects resolve. TEXT, not an INTEGER boolean: `interaction_required
 * INTEGER→text-enum` is explicit in the 059 column spec, and a numeric
 * flag here would force every caller into a truthiness coercion.
 */
export const AnomalyInteraction = {
  Optional: "optional",
  Required: "required",
} as const;
/** */
export type AnomalyInteraction = (typeof AnomalyInteraction)[keyof typeof AnomalyInteraction];

/**
 * EncounterType — what KIND of scene an `encounter_templates` row fires.
 * 'combat' resolves in the battle system; the rest are narrative beats the
 * GM narrates and 'quest' offers work instead of demanding a roll.
 */
export const EncounterType = {
  Combat: "combat",
  Dialogue: "dialogue",
  Event: "event",
  Puzzle: "puzzle",
  Trade: "trade",
  Quest: "quest",
} as const;
/** */
export type EncounterType = (typeof EncounterType)[keyof typeof EncounterType];

/**
 * EncounterTriggerType — what pulls a template into the candidate pool.
 * 'random' fires anywhere; the rest are gated by the caller having the
 * relevant context (a location, a clock reading, a quest state, a story
 * beat, or a travel phase).
 */
export const EncounterTriggerType = {
  Random: "random",
  LocationBased: "location_based",
  TimeBased: "time_based",
  QuestBased: "quest_based",
  StoryBased: "story_based",
  TravelBased: "travel_based",
} as const;
/** */
export type EncounterTriggerType = (typeof EncounterTriggerType)[keyof typeof EncounterTriggerType];

/**
 * EncounterTravelPhase — the point in a journey at which a travel_based
 * template may fire. A template with a NULL `travel_phase` fires in any
 * phase; setting one narrows it to that step.
 */
export const EncounterTravelPhase = {
  Departure: "departure",
  Journey: "journey",
  Arrival: "arrival",
} as const;
/** */
export type EncounterTravelPhase = (typeof EncounterTravelPhase)[keyof typeof EncounterTravelPhase];

/**
 * EncounterDrivingMode — who authors the encounter once it triggers.
 * 'automatic' resolves from the template's rewards/consequences JSON;
 * 'assistant' hands the template to the GM to narrate freely.
 */
export const EncounterDrivingMode = {
  Automatic: "automatic",
  Assistant: "assistant",
} as const;
/** */
export type EncounterDrivingMode = (typeof EncounterDrivingMode)[keyof typeof EncounterDrivingMode];

/**
 * EncounterTemplateState — whether a template sits in the roll pool.
 * 'disabled' keeps the row (and its rolls) for history but removes it
 * from candidate selection.
 */
export const EncounterTemplateState = {
  Enabled: "enabled",
  Disabled: "disabled",
} as const;
/** */
export type EncounterTemplateState = (typeof EncounterTemplateState)[keyof typeof EncounterTemplateState];
