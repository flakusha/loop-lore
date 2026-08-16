// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/characters — Character template config section
//
// Default characters created on app start from config templates.
// Templates NEVER override existing DB records (idempotent seeding).
// Hard IDs supported for deterministic test reseeding.

export { CHARACTERS_DEFAULTS, } from "./defaults.js";
export { charactersMeta, CharactersSection, } from "./section.js";
export type { CharacterTemplate, } from "./types.js";
