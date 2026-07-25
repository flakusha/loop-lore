// src/characters/normalizers/yaml.ts
//
// YAML normalizer.
// Converts YAML format to canonical character card.

import type { CanonicalCharacter, } from "../parser";
import { buildCanonicalFields, } from "./shared";

/**
 * Normalize YAML format to canonical character card.
 * YAML keys match canonical field names directly.
 */
export function normalizeYaml(data: Record<string, unknown>,): CanonicalCharacter {
  // YAML uses "welcome_message" instead of "first_mes"
  return {
    ...buildCanonicalFields(data, { welcomeKey: "welcome_message", },),
  };
}
