// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/personality-service/index.ts — Personality integrity service barrel

export { checkPersonalityIntegrity, } from "./integrity";
export type { PersonalityLockResult, } from "./integrity";
export { applyBehavioralModifier, getBehavioralModifiers, } from "./modifiers";
export { resolveCharacterTraits, } from "./resolve";
