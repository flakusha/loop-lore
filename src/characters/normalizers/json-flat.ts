// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/json-flat.ts
//
// Flat JSON normalizer.
// Converts flat JSON format to canonical character card.

import type { CanonicalCharacter, } from "../parser";
import { buildCanonicalFields, } from "./shared";

/**
 * Normalize flat JSON format to canonical character card.
 * Flat JSON may use either "first_mes" or "welcome_message" for the greeting.
 * @param data
 */
export function normalizeJsonFlat(data: Record<string, unknown>,): CanonicalCharacter {
  // Flatten: prefer first_mes, fall back to welcome_message
  const flat: Record<string, unknown> = {
    ...data,
    first_mes: data.first_mes ?? data.welcome_message ?? undefined,
  };

  return {
    ...buildCanonicalFields(flat,),
  };
}
