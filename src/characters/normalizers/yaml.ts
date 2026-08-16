// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
