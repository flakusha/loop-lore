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
