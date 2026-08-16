// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Template Expansion Service
 *
 * Runs at application startup to expand base template configs with:
 * - Additional keywords, actions, emotions
 * - Emotion avatar variants (generated via SD if not present)
 *
 * Supports config-driven expansion via configs/templates/ YAML files.
 */

export { expandAvatarConfig, extractActions, extractKeywords, } from "./expand.js";
export { findMissingAvatars, runTemplateExpansion, validateExpansionConfig, } from "./run.js";
export type { ExpansionConfig, ExpansionResult, } from "./types.js";
