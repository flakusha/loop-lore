// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Agency-quality enums (TASK-agency-quality-metrics).
 *
 * - `AgencyMode`: text-enum stored on `interaction_logs.agency_mode`.
 * - `AgencyDimension`: text-enum stored on agency_play_counters / agency_dimension_counters.
 */

export const AgencyMode = {
  Free: "free",
  Forced: "forced",
  Blocked: "blocked",
  Skipped: "skipped",
} as const;
export type AgencyMode = (typeof AgencyMode)[keyof typeof AgencyMode];

export const AgencyDimension = {
  Spatial: "spatial",
  Temporal: "temporal",
  Manipulation: "manipulation",
  Social: "social",
  Narrative: "narrative",
  Ludic: "ludic",
} as const;
export type AgencyDimension = (typeof AgencyDimension)[keyof typeof AgencyDimension];

/** Stable iteration order for tests / dashboards. */
export const AGENCY_DIMENSIONS: readonly AgencyDimension[] = Object.values(AgencyDimension,);
