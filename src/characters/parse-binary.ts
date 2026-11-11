// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/parse-binary.ts
//
// Binary container parsing for character cards: PNG (embedded card chunk) and
// CHARX (zip bundle). Split out of parser.ts so the format dispatch stays
// readable - and so both containers read the card payload by its own shape
// (an Agnai-native payload in a PNG is not a Tavern card).

import { extractCharx, } from "./charx";
import { isAgnaiNative, normalizeAgnai, } from "./normalizers/agnai";
import { normalizeCcV2, } from "./normalizers/ccv2";
import { normalizeCcV3, } from "./normalizers/ccv3";
import type { ParseResult, } from "./spec";
import { extractCharacterDataFromPng, } from "./steganography";

/**
 * Parse a PNG with an embedded character card chunk.
 * @param data
 * @param warnings
 * @returns parsed card, or null when the PNG carries no card chunk
 */
export function parsePngCard(data: Buffer, warnings: string[],): ParseResult | null {
  const result = extractCharacterDataFromPng(data,);
  if (!result) { return null; }

  // The container keeps its own format label (the file itself becomes the
  // avatar), but the payload is read by its own shape.
  const isV3 = result.spec === "chara_card_v3";
  const character = isV3
    ? normalizeCcV3(result.data,)
    : isAgnaiNative(result.data,)
    ? normalizeAgnai(result.data,)
    : normalizeCcV2(result.data,);

  warnings.push(`PNG ${isV3 ? "V3" : "V2"} card detected`,);
  return { character, format: isV3 ? "png-v3" : "png-v2", warnings, };
}

/**
 * Parse a CHARX bundle (zip) with an embedded card and assets.
 * @param data
 * @param warnings
 * @returns parsed card, or null when the buffer is not a CHARX bundle
 */
export async function parseCharxCard(data: Buffer, warnings: string[],): Promise<ParseResult | null> {
  try {
    const charxResult = await extractCharx(data,);
    const character = normalizeCcV3(charxResult.card,);
    character.assets = charxResult.assets;
    warnings.push(`CHARX bundle with ${charxResult.assets.length} assets`,);
    return { character, format: "charx", warnings, };
  } catch (error) {
    warnings.push(`CHARX extraction failed: ${error instanceof Error ? error.message : "unknown"}`,);
    return null;
  }
}
