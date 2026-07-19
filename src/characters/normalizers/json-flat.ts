// src/characters/normalizers/json-flat.ts
//
// Flat JSON normalizer.
// Converts flat JSON format to canonical character card.

import type { CanonicalCharacter, } from "../parser";

/**
 * Normalize flat JSON format to canonical character card.
 */
export function normalizeJsonFlat(data: Record<string, unknown>,): CanonicalCharacter {
  return {
    name: (data.name as string) ?? "",
    description: (data.description as string) ?? "",
    personality: data.personality as string | undefined,
    scenario: data.scenario as string | undefined,
    welcome_message: (data.first_mes as string) ?? (data.welcome_message as string) ?? undefined,
    mes_example: data.mes_example as string | undefined,
    system_prompt: data.system_prompt as string | undefined,
    post_history_instructions: data.post_history_instructions as string | undefined,
    alternate_greetings: data.alternate_greetings as string[] | undefined,
    tags: data.tags as string[] | undefined,
    creator: data.creator as string | undefined,
    creator_notes: data.creator_notes as string | undefined,
    character_version: data.character_version as string | undefined,
  };
}
