// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/exporters/ccv3.ts
//
// CCv3 exporter for character cards.
// Converts canonical character card to CCv3 format.

import { jsonStringifyOr, safeJsonStringify, } from "../../utils";
import type { CanonicalCharacter, } from "../parser";
import { exportBaseFields, exportLorebook, } from "./shared";

/**
 * Export canonical character card to CCv3 format.
 */
export function exportToCcV3(character: CanonicalCharacter,): Record<string, unknown> {
  const data = exportBaseFields(character,);

  // V3 additions
  if (character.nickname) { data.nickname = character.nickname; }

  // Timestamps (milliseconds)
  data.creation_date = Date.now();
  data.modification_date = Date.now();

  // Lorebook (V3: includes use_regex field)
  if (character.lorebook) {
    data.character_book = exportLorebook(character.lorebook, { includeUseRegex: true, },);
  }

  // Assets (V3 addition)
  if (character.assets?.length) {
    data.assets = Array.from(character.assets, (asset,) => ({
      type: asset.type,
      name: asset.name,
      uri: asset.uri,
      ext: asset.ext,
    }),);
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
export function exportToCcV3Json(character: CanonicalCharacter,): string {
  const ccv3 = exportToCcV3(character,);
  const result = safeJsonStringify(ccv3, 2,);
  return result.ok ? result.value : jsonStringifyOr(ccv3, "{}",);
}
