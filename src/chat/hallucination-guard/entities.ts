// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  ITEM_INDICATORS,
  LOCATION_INDICATORS,
  WORLD_INDICATORS,
} from "../../regex/hallucination";
import { COMMON_WORDS, } from "./constants";
import type { ExtractedEntity, } from "./types";

/**
 * Extract proper nouns from text, classify as character/location/item.
 * @param text
 */
export function extractProperNouns(text: string,): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  // Match capitalized words/phrases (potential proper nouns)
  const properNounRe = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/g;
  let match;

  while ((match = properNounRe.exec(text,)) !== null) {
    const name = match[1]!;
    if (seen.has(name,) || COMMON_WORDS.has(name,)) { continue; }
    seen.add(name,);

    // Simple heuristic classification
    const type = classifyEntity(name, text,);
    entities.push({ name, type, },);
  }

  return entities;
}

/**
 * Classify an entity based on context clues.
 * @param name
 * @param text
 */
export function classifyEntity(
  name: string,
  text: string,
): "character" | "location" | "item" | "world" {
  const lower = text.toLowerCase();
  const nameLower = name.toLowerCase();

  // Check surrounding context for location indicators
  if (
    LOCATION_INDICATORS.test(lower,) &&
    lower.includes(nameLower,)
  ) {
    return "location";
  }

  // Check for item indicators
  if (
    ITEM_INDICATORS.test(lower,) &&
    lower.includes(nameLower,)
  ) {
    return "item";
  }

  // Check for world indicators
  if (
    WORLD_INDICATORS.test(lower,) &&
    lower.includes(nameLower,)
  ) {
    return "world";
  }

  // Default: assume character
  return "character";
}
