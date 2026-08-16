// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory Classification Patterns
 *
 * Compiled regex patterns for classifying messages into memory types
 * (episodic, procedural, semantic) and scoring importance.
 *
 * @module regex/memory-classification
 */

// ── Episodic Patterns ─────────────────────────────────────

/** Temporal markers indicating episodic memory */
export const EPISODIC_TEMPORAL = /\b(then|after|before|during|while|suddenly|finally)\b/;

/** Action markers indicating episodic memory */
export const EPISODIC_ACTION = /\b(visited|arrived|left|entered|found|discovered|defeated)\b/;

// ── Procedural Patterns ───────────────────────────────────

/** Preference/habit markers indicating procedural memory */
export const PROCEDURAL_PREFERENCE = /\b(prefer|always|never|usually|tends to|likes to|hates)\b/;

/** Learning markers indicating procedural memory */
export const PROCEDURAL_LEARNING = /\b(learned|discovered that|realized)\b/;

// ── Importance Scoring ────────────────────────────────────

/** Decision/action language that increases importance */
export const IMPORTANCE_DECISION = /\b(decided|chose|promised|swore|vowed|committed)\b/i;

/** Emotional content that increases importance */
export const IMPORTANCE_EMOTION = /\b(angry|happy|sad|afraid|excited|love|hate)\b/i;

/** Entity pattern for proper noun detection */
export const ENTITY_PATTERN = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g;

// ── Keyword Extraction ────────────────────────────────────

/** Proper noun pattern for keyword extraction */
export const KEYWORD_PROPER_NOUN = /^[A-Z][a-z]+$/;

/** Action verb pattern for keyword extraction */
export const KEYWORD_ACTION_VERBS =
  /\b(?:visited|found|defeated|created|built|learned|discovered|fought|helped|saved|killed)\b/gi;
