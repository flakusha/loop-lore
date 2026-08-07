// src/characters/services/personality-service/index.ts — Personality integrity service barrel

export { checkPersonalityIntegrity, } from "./integrity";
export type { PersonalityLockResult, } from "./integrity";
export { applyBehavioralModifier, getBehavioralModifiers, } from "./modifiers";
export { resolveCharacterTraits, } from "./resolve";
