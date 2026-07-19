// src/characters/normalizers/toml.ts
//
// TOML normalizer.
// Converts TOML format to canonical character card.

import type { CanonicalCharacter, } from "../parser";

interface TomlCharacter {
  character?: {
    name?: string;
    description?: string;
    personality?: string;
    scenario?: string;
    welcome_message?: string;
    mes_example?: string;
    metadata?: {
      tags?: string[];
      creator?: string;
      creator_notes?: string;
      character_version?: string;
    };
    prompts?: {
      system_prompt?: string;
      post_history_instructions?: string;
    };
    greetings?: {
      alternate?: string[];
    };
  };
}

/**
 * Normalize TOML format to canonical character card.
 * TOML uses [character] section with subsections.
 */
export function normalizeToml(data: Record<string, unknown>,): CanonicalCharacter {
  const tomlData = data as TomlCharacter;
  const character = tomlData.character ?? {};

  return {
    name: character.name ?? "",
    description: character.description ?? "",
    personality: character.personality,
    scenario: character.scenario,
    welcome_message: character.welcome_message,
    mes_example: character.mes_example,
    system_prompt: character.prompts?.system_prompt,
    post_history_instructions: character.prompts?.post_history_instructions,
    alternate_greetings: character.greetings?.alternate,
    tags: character.metadata?.tags,
    creator: character.metadata?.creator,
    creator_notes: character.metadata?.creator_notes,
    character_version: character.metadata?.character_version,
  };
}
