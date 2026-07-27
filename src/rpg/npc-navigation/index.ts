/**
 * NPC Navigation — Public API
 *
 * Re-exports NPC navigation services for use by routes and other modules.
 */
export { NpcNavigationService, } from "./service";
export type {
  LocationConnection,
  MovementResult,
  NpcMovementState,
} from "./service";
export { MovementPattern, } from "./service";
