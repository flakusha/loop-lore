/**
 * Events Module — Barrel
 *
 * Story event extraction, validation, and application.
 */
export { extractEvents } from "./extraction";
export { validateEvents } from "./validation";
export type { ValidationResult } from "./validation";
export { applyEvents } from "./application";
export type { AppliedEvent } from "./application";
