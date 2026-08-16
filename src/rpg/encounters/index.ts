// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Encounter System — Public API
 *
 * Re-exports all encounter services for use by routes and other modules.
 */
export { EncounterService, } from "./service";
export type {
  AdvancePhaseResult,
  CreateEncounterOpts,
  EncounterOutcome,
  EncounterPhase,
  NsfwEncounter,
} from "./service";
