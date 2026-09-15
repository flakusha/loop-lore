// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/generation.ts — re-export: single source in sections/generation/
// Sections copy is canonical: chatDefaults instead of the stale regexTransforms
// literal (RegexTransform lives in schema types, not defaults).
export { GENERATION_DEFAULTS, GENERATION_PROVIDERS_DEFAULTS, } from "../sections/generation";
