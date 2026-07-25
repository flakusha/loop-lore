// src/characters/normalizers/toml.ts
//
// TOML normalizer.
// Converts TOML format to canonical character card.

import type { CanonicalCharacter, } from "../parser";
import { buildCanonicalFields, } from "./shared";

/**
 * Normalize TOML format to canonical character card.
 * TOML uses [character] section with nested subsections.
 * We flatten the nested structure into a flat Record before passing to the shared builder.
 */
export function normalizeToml(data: Record<string, unknown>,): CanonicalCharacter {
  const char = (data.character ?? {}) as Record<string, unknown>;
  const meta = (char.metadata ?? {}) as Record<string, unknown>;
  const prompts = (char.prompts ?? {}) as Record<string, unknown>;
  const greetings = (char.greetings ?? {}) as Record<string, unknown>;

  // Flatten nested TOML structure
  const flat: Record<string, unknown> = {
    name: char.name,
    description: char.description,
    personality: char.personality,
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
  } as CanonicalCharacter;
}
