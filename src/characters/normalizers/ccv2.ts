// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/ccv2.ts
//
// CCv2 (Character Card V2) normalizer.
// Converts CCv2 format to canonical character card.

import type { CanonicalCharacter, LorebookData, } from "../spec";
import { buildCanonicalFields, buildLorebook, cardObject, extractEnvelope, } from "./shared";

/**
 * Normalize CCv2 format to canonical character card.
 *
 * The card payload is untyped JSON: the envelope, the lorebook and the
 * extensions blob are checked before their fields are read.
 * @param data
 * @returns Record<string
 */
export function normalizeCcV2(data: Record<string, unknown>,): CanonicalCharacter {
  const raw = extractEnvelope(data,);

  const book = cardObject(raw.character_book,);
  const lorebook: LorebookData | undefined = book ? buildLorebook(book,) : undefined;

  return {
    ...buildCanonicalFields(raw,),
    extensions: cardObject(raw.extensions,),
    lorebook,
  };
}
