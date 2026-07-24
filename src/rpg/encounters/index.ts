/**
 * NSFW Encounter System — Public API
 *
 * Re-exports all encounter services for use by routes and other modules.
 */
export { EncounterService, } from "./service";
export type {
  EncounterPhase,
  EncounterOutcome,
  NsfwEncounter,
  CreateEncounterOpts,
  AdvancePhaseResult,
} from "./service";
