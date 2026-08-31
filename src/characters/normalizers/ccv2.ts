// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/ccv2.ts
//
// CCv2 (Character Card V2) normalizer.
// Converts CCv2 format to canonical character card.

import type { CanonicalCharacter, LorebookData, } from "../spec";
import { buildCanonicalFields, buildLorebook, extractEnvelope, } from "./shared";

interface CCv2Data {
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
  creator?: string;
  character_version?: string;
  extensions?: Record<string, unknown>;
  character_book?: Record<string, unknown>;
}

/**
 * Normalize CCv2 format to canonical character card.
 * @param data
 */
export function normalizeCcV2(data: Record<string, unknown>,): CanonicalCharacter {
  const raw = extractEnvelope(data,);
  const cardData = raw as CCv2Data;

  const lorebook: LorebookData | undefined = cardData.character_book
    ? buildLorebook(cardData.character_book,)
    : undefined;

  return {
    ...buildCanonicalFields(raw,),
    extensions: cardData.extensions,
    lorebook,
  };
}
