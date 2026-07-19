// src/characters/exporters/yaml.ts
//
// YAML exporter for character cards.
// Converts canonical character card to YAML format.

import { dump as yamlDump } from "js-yaml";
import type { CanonicalCharacter } from "../parser";

/**
 * Export canonical character card to YAML format.
 */
export function exportToYaml(character: CanonicalCharacter): string {
  const yamlData: Record<string, unknown> = {};

  // Core fields
  if (character.name) yamlData.name = character.name;
  if (character.description) yamlData.description = character.description;
  if (character.personality) yamlData.personality = character.personality;
  if (character.scenario) yamlData.scenario = character.scenario;
  if (character.system_prompt) yamlData.system_prompt = character.system_prompt;
  if (character.welcome_message) yamlData.welcome_message = character.welcome_message;
  if (character.mes_example) yamlData.mes_example = character.mes_example;
  if (character.post_history_instructions) {
    yamlData.post_history_instructions = character.post_history_instructions;
  }

  // Array fields
  if (character.alternate_greetings?.length) {
    yamlData.alternate_greetings = character.alternate_greetings;
  }
  if (character.tags?.length) {
    yamlData.tags = character.tags;
  }

  // Metadata
  if (character.creator) yamlData.creator = character.creator;
  if (character.creator_notes) yamlData.creator_notes = character.creator_notes;
  if (character.character_version) yamlData.character_version = character.character_version;

  return yamlDump(yamlData, { lineWidth: -1, noRefs: true });
}
