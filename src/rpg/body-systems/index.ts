/**
 * Body Systems — Public API
 *
 * Re-exports all body system services for use by routes and other modules.
 */
export { BodySystemService, } from "./service";
export type {
  BodyModification,
  BodyProfile,
  HeatCycleState,
  UpdateBodyProfileOpts,
} from "./service";
