// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/toml.ts
//
// TOML normalizer.
// Converts TOML format to canonical character card.

import type { CanonicalCharacter, } from "../parser";
import { buildCanonicalFields, cardObject, } from "./shared";

/**
 * Normalize TOML format to canonical character card.
 * TOML uses [character] section with nested subsections.
 * We flatten the nested structure into a flat Record before passing to the shared builder.
 * @param data
 * @returns Record<string
 */
export function normalizeToml(data: Record<string, unknown>,): CanonicalCharacter {
  const char = cardObject(data.character,) ?? {};
  const meta = cardObject(char.metadata,) ?? {};
  const prompts = cardObject(char.prompts,) ?? {};
  const greetings = cardObject(char.greetings,) ?? {};

  // Flatten nested TOML structure
  const flat: Record<string, unknown> = {
    name: char.name,
    description: char.description,
    personality: char.personality,
    appearance: char.appearance,
    default_outfit: char.default_outfit,
    outfits: char.outfits,
    scenario: char.scenario,
    welcome_message: char.welcome_message,
    mes_example: char.mes_example,
    system_prompt: prompts.system_prompt,
    post_history_instructions: prompts.post_history_instructions,
    alternate_greetings: greetings.alternate,
    tags: meta.tags,
    creator: meta.creator,
    creator_notes: meta.creator_notes,
    character_version: meta.character_version,
  };

  return {
    ...buildCanonicalFields(flat, { welcomeKey: "welcome_message", },),
  };
}
