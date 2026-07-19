// src/characters/exporters/toml.ts
//
// TOML exporter for character cards.
// Converts canonical character card to TOML format.

import type { CanonicalCharacter } from "../parser";
import { stringify as tomlStringify } from "smol-toml";

/**
 * Export canonical character card to TOML format.
 */
export function exportToToml(character: CanonicalCharacter): string {
  // Build nested structure for TOML
  const characterSection: Record<string, unknown> = {};
  if (character.name) characterSection.name = character.name;
  if (character.description) characterSection.description = character.description;
  if (character.personality) characterSection.personality = character.personality;
  if (character.scenario) characterSection.scenario = character.scenario;
  if (character.welcome_message) characterSection.welcome_message = character.welcome_message;
  if (character.mes_example) characterSection.mes_example = character.mes_example;

  // Metadata section
  const metadataSection: Record<string, unknown> = {};
  if (character.tags?.length) metadataSection.tags = character.tags;
  if (character.creator) metadataSection.creator = character.creator;
  if (character.creator_notes) metadataSection.creator_notes = character.creator_notes;
  if (character.character_version) {
    metadataSection.character_version = character.character_version;
  }

  // Prompts section
  const promptsSection: Record<string, unknown> = {};
  if (character.system_prompt) promptsSection.system_prompt = character.system_prompt;
  if (character.post_history_instructions) {
    promptsSection.post_history_instructions = character.post_history_instructions;
  }

  // Greetings section
  const greetingsSection: Record<string, unknown> = {};
  if (character.alternate_greetings?.length) {
    greetingsSection.alternate = character.alternate_greetings;
  }

  // Assemble final structure
  const tomlData: Record<string, unknown> = {
    character: characterSection,
  };

  if (Object.keys(metadataSection).length > 0) {
    (tomlData.character as Record<string, unknown>).metadata = metadataSection;
  }

  if (Object.keys(promptsSection).length > 0) {
    (tomlData.character as Record<string, unknown>).prompts = promptsSection;
  }

  if (Object.keys(greetingsSection).length > 0) {
    (tomlData.character as Record<string, unknown>).greetings = greetingsSection;
  }

  return tomlStringify(tomlData);
}
