/**
 * Code Fence and JSON Extraction Regex Patterns
 *
 * Patterns for extracting JSON from code fences and detecting JSON arrays.
 *
 * Sources: src/memory/extraction.ts, src/assistant/commands/create.ts
 */

/** Extract content from ```json ... ``` code fences */
export const CODE_FENCE_JSON = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;

/** Match JSON array contents */
export const JSON_ARRAY = /\[[\s\S]*\]/;

/** Strip opening ```json or ``` fence marker */
export const FENCE_OPEN = /^```(?:json)?\s*\n?/;
