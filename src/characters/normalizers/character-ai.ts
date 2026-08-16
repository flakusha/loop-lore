// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/character-ai.ts
//
// Character.AI export normalizer.
// Converts Character.AI format to canonical character card.

import type { CanonicalCharacter, } from "../spec";

interface CharacterAIData {
  name?: string;
  description?: string;
  greeting?: string;
  definition?: string;
  examples_of_dialogue?: string;
  tags?: string[];
  visibility?: string;
}

/**
 * Normalize Character.AI format to canonical character card.
 */
export function normalizeCharacterAI(data: Record<string, unknown>,): CanonicalCharacter {
  const cardData = data as CharacterAIData;

  // Character.AI uses macro syntax in definition field
  // {{char}} and {{user}} are preserved as-is
  let description = cardData.description ?? "";
  if (cardData.definition) {
    // Append definition to description, preserving macro syntax
    description = description ? `${description}\n\n${cardData.definition}` : cardData.definition;
  }

  return {
    name: cardData.name ?? "",
    description,
    personality: "",
    welcome_message: cardData.greeting,
    mes_example: cardData.examples_of_dialogue,
    tags: cardData.tags,
  };
}
