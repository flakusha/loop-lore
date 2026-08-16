/**
 * Validation schema barrel.
 *
 * Re-exports the full public surface of the split schema modules
 * (formerly the flat `src/validation/schemas.ts` bank). Route handlers
 * import from `../validation/schemas` — this barrel keeps that path stable.
 *
 * @module validation/schemas
 */

export * from "./primitives";
export * from "./chat";
export * from "./invites";
export * from "./messages";
export * from "./actors";
export * from "./users";
export * from "./admin";
export * from "./worlds";
export * from "./entities";
export * from "./story";
export * from "./quests";
export * from "./auth";
export * from "./settings";
export * from "./blog";
export * from "./character-systems";
export * from "./character-relations";
export * from "./story-items";
export * from "./world-state";
export * from "./world-setup";
export * from "./api-keys";
export * from "./notifications";
export * from "./telemetry";
export * from "./admin-templates";
