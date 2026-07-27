// src/characters/normalizers/ccv3.ts
//
// CCv3 (Character Card V3) normalizer.
// Converts CCv3 format to canonical character card.

import type { CanonicalCharacter, CharacterAsset, LorebookData, } from "../spec";
import { buildCanonicalFields, buildLorebook, extractEnvelope, } from "./shared";

interface CCv3Data {
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
  nickname?: string;
  extensions?: Record<string, unknown>;
  creation_date?: number;
  modification_date?: number;
  assets?: {
    type?: string;
    name?: string;
    uri?: string;
    ext?: string;
  }[];
  character_book?: Record<string, unknown>;
}

/**
 * Normalize CCv3 format to canonical character card.
 */
export function normalizeCcV3(data: Record<string, unknown>,): CanonicalCharacter {
  const raw = extractEnvelope(data,);
  const cardData = raw as CCv3Data;

  const lorebook: LorebookData | undefined = cardData.character_book
    ? buildLorebook(cardData.character_book,)
    : undefined;

  const assets: CharacterAsset[] | undefined = cardData.assets?.map((asset,) => ({
    type: asset.type ?? "unknown",
    name: asset.name ?? "unnamed",
    uri: asset.uri ?? "",
    ext: asset.ext ?? "",
  }));

  return {
    ...buildCanonicalFields(raw,),
    nickname: cardData.nickname,
    extensions: cardData.extensions,
    lorebook,
    assets,
  };
}
