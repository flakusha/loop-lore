// src/characters/normalizers/ccv3.ts
//
// CCv3 (Character Card V3) normalizer.
// Converts CCv3 format to canonical character card.

import type { CanonicalCharacter, CharacterAsset, LorebookData } from "../parser";

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
  character_book?: {
    name?: string;
    description?: string;
    scan_depth?: number;
    token_budget?: number;
    recursive_scanning?: boolean;
    entries?: {
      keys?: string[];
      content?: string;
      enabled?: boolean;
      insertion_order?: number;
      case_sensitive?: boolean;
      name?: string;
      priority?: number;
      id?: number;
      comment?: string;
      selective?: boolean;
      constant?: boolean;
      position?: string;
      use_regex?: boolean;
      extensions?: Record<string, unknown>;
    }[];
  };
}

/**
 * Normalize CCv3 format to canonical character card.
 */
export function normalizeCcV3(data: Record<string, unknown>): CanonicalCharacter {
  // Extract data from envelope if present
  const cardData = (data.data ?? data) as CCv3Data;

  const lorebook: LorebookData | undefined = cardData.character_book
    ? {
      name: cardData.character_book.name,
      description: cardData.character_book.description,
      scan_depth: cardData.character_book.scan_depth,
      token_budget: cardData.character_book.token_budget,
      recursive_scanning: cardData.character_book.recursive_scanning,
      entries: (cardData.character_book.entries ?? []).map((entry) => ({
        keys: entry.keys ?? [],
        content: entry.content ?? "",
        enabled: entry.enabled ?? true,
        insertion_order: entry.insertion_order ?? 0,
        case_sensitive: entry.case_sensitive ?? false,
        name: entry.name ?? "",
        priority: entry.priority ?? 0,
        id: entry.id ?? 0,
        comment: entry.comment,
        selective: entry.selective ?? false,
        constant: entry.constant ?? false,
        position: (entry.position as "before_char" | "after_char") ?? "before_char",
        use_regex: entry.use_regex,
        extensions: entry.extensions,
      })),
    }
    : undefined;

  const assets: CharacterAsset[] | undefined = cardData.assets?.map((asset) => ({
    type: asset.type ?? "unknown",
    name: asset.name ?? "unnamed",
    uri: asset.uri ?? "",
    ext: asset.ext ?? "",
  }));

  return {
    name: cardData.name ?? "",
    description: cardData.description ?? "",
    personality: cardData.personality,
    scenario: cardData.scenario,
    welcome_message: cardData.first_mes,
    mes_example: cardData.mes_example,
    system_prompt: cardData.system_prompt,
    post_history_instructions: cardData.post_history_instructions,
    alternate_greetings: cardData.alternate_greetings,
    tags: cardData.tags,
    creator: cardData.creator,
    character_version: cardData.character_version,
    nickname: cardData.nickname,
    extensions: cardData.extensions,
    lorebook,
    assets,
  };
}
