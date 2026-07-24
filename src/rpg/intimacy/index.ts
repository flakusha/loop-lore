/**
 * Intimacy System — Public API
 *
 * Re-exports all intimacy services for use by routes and other modules.
 */
export { IntimacyService, } from "./service";
export type {
  ApplyIntimacyActionOpts,
  IntimacyAction,
  IntimacyPair,
  IntimacyThreshold,
} from "./service";
