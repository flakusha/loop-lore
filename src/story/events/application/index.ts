/**
 * Event Application — Barrel
 *
 * Apply validated world events to the database.
 * Each event type has a dedicated handler.
 */
export { applyEvents, } from "./apply";
export type { AppliedEvent, ApplyEventsOpts, } from "./types";
