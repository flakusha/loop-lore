// src/characters/exporters/shared.ts
//
// Shared export helpers for character card formats (CCv2, CCv3).

import type {
  CanonicalCharacter,
  LorebookData,
  LorebookEntry,
} from "../spec";

/**
 * Map canonical character fields to version-agnostic data object.
 * Core fields shared between CCv2 and CCv3.
 */
export function exportBaseFields(character: CanonicalCharacter,): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  // Core fields
  if (character.name) { data.name = character.name; }
  if (character.description) { data.description = character.description; }
  if (character.personality) { data.personality = character.personality; }
  if (character.scenario) { data.scenario = character.scenario; }
  if (character.welcome_message) { data.first_mes = character.welcome_message; }
  if (character.mes_example) { data.mes_example = character.mes_example; }
  if (character.system_prompt) { data.system_prompt = character.system_prompt; }
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

  // Metadata
  if (character.creator) { data.creator = character.creator; }
  if (character.character_version) { data.character_version = character.character_version; }

  // Extensions
  if (character.extensions && Object.keys(character.extensions,).length > 0) {
    data.extensions = character.extensions;
  }

  return data;
}

/**
 * Export lorebook entries with consistent field mapping.
 * V2 entries omit `use_regex`; V3 entries include it.
 */
export function exportLorebookEntries(
  entries: LorebookEntry[],
  options: { includeUseRegex?: boolean } = {},
): Record<string, unknown>[] {
  return Array.from(entries, (entry,) => {
    const mapped: Record<string, unknown> = {
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
    };

    if (options.includeUseRegex && entry.use_regex !== undefined) {
      mapped.use_regex = entry.use_regex;
    }
    if (entry.extensions !== undefined) {
      mapped.extensions = entry.extensions;
    }

    return mapped;
  },);
}

/**
 * Map lorebook data to character_book output.
 */
export function exportLorebook(
  lorebook: LorebookData,
  options: { includeUseRegex?: boolean } = {},
): Record<string, unknown> {
  return {
    name: lorebook.name,
    description: lorebook.description,
    scan_depth: lorebook.scan_depth,
    token_budget: lorebook.token_budget,
    recursive_scanning: lorebook.recursive_scanning,
    entries: exportLorebookEntries(lorebook.entries, options,),
  };
}
