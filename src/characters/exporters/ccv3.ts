// src/characters/exporters/ccv3.ts
//
// CCv3 exporter for character cards.
// Converts canonical character card to CCv3 format.

import type { CanonicalCharacter } from "../parser";
import { safeJsonStringify } from "../../utils/safe-json";

/**
 * Export canonical character card to CCv3 format.
 */
export function exportToCcV3(character: CanonicalCharacter): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  // Core fields (same as V2)
  if (character.name) data.name = character.name;
  if (character.description) data.description = character.description;
  if (character.personality) data.personality = character.personality;
  if (character.scenario) data.scenario = character.scenario;
  if (character.welcome_message) data.first_mes = character.welcome_message;
  if (character.mes_example) data.mes_example = character.mes_example;
  if (character.system_prompt) data.system_prompt = character.system_prompt;
  if (character.post_history_instructions) {
    data.post_history_instructions = character.post_history_instructions;
  }

  // Array fields
  if (character.alternate_greetings?.length) {
    data.alternate_greetings = character.alternate_greetings;
  }
  if (character.tags?.length) {
    data.tags = character.tags;
  }

  // V3 additions
  if (character.nickname) data.nickname = character.nickname;

  // Timestamps (milliseconds)
  data.creation_date = Date.now();
  data.modification_date = Date.now();

  // Metadata
  if (character.creator) data.creator = character.creator;
  if (character.character_version) data.character_version = character.character_version;

  // Extensions
  if (character.extensions && Object.keys(character.extensions).length > 0) {
    data.extensions = character.extensions;
  }

  // Lorebook (with V3 additions)
  if (character.lorebook) {
    data.character_book = {
      name: character.lorebook.name,
      description: character.lorebook.description,
      scan_depth: character.lorebook.scan_depth,
      token_budget: character.lorebook.token_budget,
      recursive_scanning: character.lorebook.recursive_scanning,
      entries: character.lorebook.entries.map((entry) => ({
        keys: entry.keys,
        content: entry.content,
        enabled: entry.enabled,
        insertion_order: entry.insertion_order,
        case_sensitive: entry.case_sensitive,
        name: entry.name,
        priority: entry.priority,
        id: entry.id,
        comment: entry.comment,
        selective: entry.selective,
        constant: entry.constant,
        position: entry.position,
        use_regex: entry.use_regex,
        extensions: entry.extensions,
      })),
    };
  }

  // Assets (V3 addition)
  if (character.assets?.length) {
    data.assets = character.assets.map((asset) => ({
      type: asset.type,
      name: asset.name,
      uri: asset.uri,
      ext: asset.ext,
    }));
  }

  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data,
  };
}

/**
 * Export canonical character card to CCv3 JSON string.
 */
export function exportToCcV3Json(character: CanonicalCharacter): string {
  const ccv3 = exportToCcV3(character);
  const result = safeJsonStringify(ccv3, 2);
  return result.ok ? result.value : JSON.stringify(ccv3);
}
