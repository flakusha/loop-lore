/**
 * Fantasy/Kink System — Public API
 *
 * Re-exports all fantasy services for use by routes and other modules.
 */
export { FantasyService, } from "./service";
export type {
  Fantasy,
  CreateFantasyOpts,
  DiscoveryResult,
} from "./service";
