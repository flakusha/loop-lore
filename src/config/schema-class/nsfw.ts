// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/nsfw.ts — re-export: single source in sections/nsfw.ts
// Sections copy is canonical: useLlmClassifier true matches NsfwConfig docs
// ("On by default"). Runtime default flips false -> true.
export { NSFW_DEFAULTS, } from "../sections/nsfw";
