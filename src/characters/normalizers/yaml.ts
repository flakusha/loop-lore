// src/characters/normalizers/yaml.ts
//
// YAML normalizer.
// Converts YAML format to canonical character card.

import type { CanonicalCharacter, } from "../parser";

interface YamlCharacter {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  system_prompt?: string;
  welcome_message?: string;
  mes_example?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  creator_notes?: string;
  character_version?: string;
}

/**
 * Normalize YAML format to canonical character card.
 * YAML keys match canonical field names directly.
 */
export function normalizeYaml(data: Record<string, unknown>,): CanonicalCharacter {
  const cardData = data as YamlCharacter;

  return {
    name: cardData.name ?? "",
    description: cardData.description ?? "",
    personality: cardData.personality,
    scenario: cardData.scenario,
    welcome_message: cardData.welcome_message,
    mes_example: cardData.mes_example,
    system_prompt: cardData.system_prompt,
    post_history_instructions: cardData.post_history_instructions,
    alternate_greetings: cardData.alternate_greetings,
    tags: cardData.tags,
    creator: cardData.creator,
    creator_notes: cardData.creator_notes,
    character_version: cardData.character_version,
  };
}
