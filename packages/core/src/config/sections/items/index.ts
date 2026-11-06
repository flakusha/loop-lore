// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/items — Item template config section
//
// Default item definitions created on app start from config templates.
// Templates NEVER override existing DB records (idempotent seeding).
// Hard IDs supported for deterministic test reseeding.

export { ITEMS_DEFAULTS, } from "./defaults.js";
export { itemsMeta, ItemsSection, } from "./section.js";
export type { ItemsDefaultsShape, ItemTemplate, } from "./types.js";
