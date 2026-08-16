// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Transition Patterns
 *
 * Compiled regex patterns for detecting scene changes, context cuts,
 * and location transitions in user messages.
 *
 * @module regex/transitions
 */

// ── Movement Patterns ─────────────────────────────────────

/** Character movement verbs */
export const MOVEMENT_VERBS = /\b(i|we|you)\s+(walk|move|go|travel|head|enter|leave|exit)\b/i;

// ── Scene Transition Patterns ─────────────────────────────

/** Scene/setting/location change indicators */
export const SCENE_CHANGE = /\b(scene|setting|location)\s+(shifts?|changes?|moves?|transitions?)\b/i;

/** Explicit transition phrases */
export const TRANSITION_PHRASES = /\b(let'?s?\s+go\s+to|heading\s+to|arriving?\s+at)\b/i;

/** Temporal transition phrases */
export const TEMPORAL_TRANSITION = /\b(after\s+(a\s+)?(while|moment|few\s+minutes|long\s+journey))\b/i;

// ── Context Cut Patterns ──────────────────────────────────

/** Context cut / time skip indicators */
export const CONTEXT_CUT = /\b(context\s*cut|skip\s*(ahead|forward|time))\b/i;
