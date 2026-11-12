// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/ccv3.ts
//
// CCv3 (Character Card V3) normalizer.
// Converts CCv3 format to canonical character card.

import type { CanonicalCharacter, CharacterAsset, LorebookData, } from "../spec";
import {
  buildCanonicalFields,
  buildLorebook,
  cardNumber,
  cardObject,
  cardOptionalText,
  cardText,
  extractEnvelope,
} from "./shared";

/**
 * Normalize CCv3 format to canonical character card.
 *
 * The card payload is untyped JSON: the envelope, the assets list, the lorebook
 * and the extensions blob are checked before their fields are read.
 * @param data
 * @returns Record<string
 */
export function normalizeCcV3(data: Record<string, unknown>,): CanonicalCharacter {
  const raw = extractEnvelope(data,);

  const book = cardObject(raw.character_book,);
  const lorebook: LorebookData | undefined = book ? buildLorebook(book,) : undefined;

  const assets: CharacterAsset[] | undefined = Array.isArray(raw.assets,)
    ? raw.assets.map((asset,) => {
      const item = cardObject(asset,) ?? {};
      return {
        type: cardText(item.type,) || "unknown",
        name: cardText(item.name,) || "unnamed",
        uri: cardText(item.uri,),
        ext: cardText(item.ext,),
      };
    },)
    : undefined;

  return {
    ...buildCanonicalFields(raw,),
    nickname: cardOptionalText(raw.nickname,),
    extensions: cardObject(raw.extensions,),
    creation_date: cardNumber(raw.creation_date,),
    modification_date: cardNumber(raw.modification_date,),
    lorebook,
    assets,
  };
}
