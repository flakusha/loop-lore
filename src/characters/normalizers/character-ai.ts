// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/character-ai.ts
//
// Character.AI export normalizer.
// Converts Character.AI format to canonical character card.

import type { CanonicalCharacter, } from "../spec";
import { cardOptionalText, cardText, cardTextList, } from "./shared";

/**
 * Normalize Character.AI format to canonical character card.
 *
 * The card payload is untyped JSON, so every field is narrowed to its runtime
 * type here rather than cast: a card whose `name` is a number must not reach
 * the character row as a number.
 * @param data
 * @returns Record<string
 */
export function normalizeCharacterAI(data: Record<string, unknown>,): CanonicalCharacter {
  // Character.AI uses macro syntax in definition field
  // {{char}} and {{user}} are preserved as-is
  const description = cardText(data.description,);
  const definition = cardText(data.definition,);
  // Append definition to description, preserving macro syntax
  const fullDescription = description && definition
    ? `${description}\n\n${definition}`
    : (description || definition);

  // A Character.AI card carries no separate personality, appearance or
  // wardrobe: its persona lives in `description` + `definition`, both of which
  // are kept in the description. The import maps the card faithfully - copying
  // the description into the missing fields would print the same prose twice.
  return {
    name: cardText(data.name,),
    description: fullDescription,
    personality: "",
    appearance: "",
    default_outfit: "",
    outfits: [],
    welcome_message: cardOptionalText(data.greeting,),
    mes_example: cardOptionalText(data.examples_of_dialogue,),
    tags: cardTextList(data.tags,),
  };
}
