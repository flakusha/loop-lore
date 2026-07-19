// src/characters/exporters/ccv2.ts
//
// CCv2 exporter for character cards.
// Converts canonical character card to CCv2 format.

import { safeJsonStringify, } from "../../utils/safe-json";
import type { CanonicalCharacter, } from "../parser";
import { exportBaseFields, exportLorebook, } from "./shared";

/**
 * Export canonical character card to CCv2 format.
 */
export function exportToCcV2(character: CanonicalCharacter,): Record<string, unknown> {
  const data = exportBaseFields(character,);

  // Lorebook (V2: no use_regex field)
  if (character.lorebook) {
    data.character_book = exportLorebook(character.lorebook,);
  }

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data,
  };
}

/**
 * Export canonical character card to CCv2 JSON string.
 */
export function exportToCcV2Json(character: CanonicalCharacter,): string {
  const ccv2 = exportToCcV2(character,);
  const result = safeJsonStringify(ccv2, 2,);
  return result.ok ? result.value : JSON.stringify(ccv2,);
}
