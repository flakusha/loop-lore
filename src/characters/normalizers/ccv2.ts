// src/characters/normalizers/ccv2.ts
//
// CCv2 (Character Card V2) normalizer.
// Converts CCv2 format to canonical character card.

import type { CanonicalCharacter, LorebookData, } from "../parser";

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
      extensions?: Record<string, unknown>;
    }[];
  };
}

/**
 * Normalize CCv2 format to canonical character card.
 */
export function normalizeCcV2(data: Record<string, unknown>,): CanonicalCharacter {
  // Extract data from envelope if present
  const cardData = (data.data ?? data) as CCv2Data;

  const lorebook: LorebookData | undefined = cardData.character_book
    ? {
      name: cardData.character_book.name,
      description: cardData.character_book.description,
      scan_depth: cardData.character_book.scan_depth,
      token_budget: cardData.character_book.token_budget,
      recursive_scanning: cardData.character_book.recursive_scanning,
      entries: (cardData.character_book.entries ?? []).map((entry,) => ({
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
        extensions: entry.extensions,
      })),
    }
    : undefined;

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
    extensions: cardData.extensions,
    lorebook,
  };
}
