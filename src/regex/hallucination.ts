/**
 * Hallucination Detection Patterns
 *
 * Compiled regex patterns for classifying entities in generated text
 * as characters, locations, items, or worlds based on context clues.
 *
 * @module regex/hallucination
 */

// ── Location Indicators ───────────────────────────────────

/** Words indicating entity is a location */
export const LOCATION_INDICATORS = /\b(at|in|near|toward|from|arrived|entered|left|visited)\b/i;

// ── Item Indicators ───────────────────────────────────────

/** Words indicating entity is an item */
export const ITEM_INDICATORS = /\b(picked up|found|equipped|used|wielded|wearing|carrying)\b/i;

// ── World Indicators ──────────────────────────────────────

/** Words indicating entity is a world/realm */
export const WORLD_INDICATORS = /\b(world|realm|kingdom|land|dimension)\b/i;
