// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/exporters/png.ts
//
// PNG exporter for character cards.
// Exports character data embedded in PNG image (V2+V3 chunks).

import type { CanonicalCharacter, } from "../parser";
import { getMinimalPng, insertCharacterDataIntoPng, } from "../steganography";

/**
 * Export canonical character card to PNG with embedded data.
 * Embeds both V2 and V3 character data in PNG tEXt chunks.
 * @param character
 */
export function exportToPng(character: CanonicalCharacter,): Buffer {
  // Get minimal PNG as base image
  const pngBase = getMinimalPng();

  // Convert CanonicalCharacter to the format expected by insertCharacterDataIntoPng
  const characterData: Record<string, unknown> = {
    name: character.name,
    description: character.description,
    personality: character.personality,
    scenario: character.scenario,
    first_mes: character.welcome_message,
    mes_example: character.mes_example,
    system_prompt: character.system_prompt,
    post_history_instructions: character.post_history_instructions,
    alternate_greetings: character.alternate_greetings,
    tags: character.tags,
    creator: character.creator,
    creator_notes: character.creator_notes,
    character_version: character.character_version,
    nickname: character.nickname,
    content_rating: character.content_rating,
    nsfw_categories: character.nsfw_categories,
    nsfw_hard_limits: character.nsfw_hard_limits,
    lorebook: character.lorebook,
    assets: character.assets,
    extensions: character.extensions,
  };

  // Insert character data into PNG (both V2 and V3 chunks)
  return insertCharacterDataIntoPng(pngBase, characterData,);
}

/**
 * Export canonical character card to PNG base64 string.
 * @param character
 */
export function exportToPngBase64(character: CanonicalCharacter,): string {
  const pngBuffer = exportToPng(character,);
  return pngBuffer.toString("base64",);
}
