// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/exporters/yaml.ts
//
// YAML exporter for character cards.
// Converts canonical character card to YAML format.
//
// Adoption status (TASK-adopt-bun-yaml-to-replace-js-yaml):
//   DEFERRED on Bun.YAML.stringify because the export pipeline emits
//   multi-line block-style scalars (description, personality, scenario,
//   system_prompt, mes_example, etc.) and Bun.YAML.stringify lacks a
//   `lineWidth` option — long single-line content would not be wrapped
//   to the readable block-style produced here. Tracked in:
//     https://github.com/oven-sh/bun/issues/39959
//   Re-evaluate when Bun ships a lineWidth (or block-style multiline)
//   knob — at that point this module can drop `js-yaml` in one diff.
//
// lean-ctx: bun:yaml stringify uses flow-style (compact), no lineWidth option;
//          Bun.YAML.stringify produces incompatible output for multiline YAML.
//          Keep js-yaml until Bun supports block-style or lineWidth:-1.
import { dump as yamlDump, } from "js-yaml";
import type { CanonicalCharacter, } from "../parser";

/**
 * Export canonical character card to YAML format.
 */
export function exportToYaml(character: CanonicalCharacter,): string {
  const yamlData: Record<string, unknown> = {};

  if (character.name) { yamlData.name = character.name; }
  if (character.description) { yamlData.description = character.description; }
  if (character.personality) { yamlData.personality = character.personality; }
  if (character.scenario) { yamlData.scenario = character.scenario; }
  if (character.system_prompt) { yamlData.system_prompt = character.system_prompt; }
  if (character.welcome_message) { yamlData.welcome_message = character.welcome_message; }
  if (character.mes_example) { yamlData.mes_example = character.mes_example; }
  if (character.post_history_instructions) {
    yamlData.post_history_instructions = character.post_history_instructions;
  }

  if (character.alternate_greetings?.length) {
    yamlData.alternate_greetings = character.alternate_greetings;
  }
  if (character.tags?.length) {
    yamlData.tags = character.tags;
  }

  if (character.creator) { yamlData.creator = character.creator; }
  if (character.creator_notes) { yamlData.creator_notes = character.creator_notes; }
  if (character.character_version) { yamlData.character_version = character.character_version; }

  return yamlDump(yamlData, { lineWidth: -1, noRefs: true, },);
}
