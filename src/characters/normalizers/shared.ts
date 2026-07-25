// src/characters/normalizers/shared.ts
//
// Shared helpers for character card normalizers.
// Eliminates duplicate field-mapping and lorebook-construction logic
// across ccv2, ccv3, yaml, toml, and json-flat normalizers.

import type { CanonicalCharacter, LorebookData, LorebookEntry, } from "../parser";

/**
 * Extract card data from an envelope wrapper.
 * CCv2/CCv3 wrap their data in `{ data: { ... } }`.
 * Other formats pass data directly.
 */
export function extractEnvelope(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return (data.data ?? data) as Record<string, unknown>;
}

/**
 * Build the common fields of a CanonicalCharacter.
 * Normalizers call this and spread any extra fields (lorebook, assets, extensions, etc.)
 * onto the result.
 */
export function buildCanonicalFields(
  raw: Record<string, unknown>,
  opts?: {
    /** Field name for the welcome message (default: "first_mes") */
    welcomeKey?: string;
  },
): Omit<CanonicalCharacter, "lorebook" | "assets" | "extensions" | "nickname"> {
  const welcomeKey = opts?.welcomeKey ?? "first_mes";
  return {
    name: (raw.name as string) ?? "",
    description: (raw.description as string) ?? "",
    personality: raw.personality as string | undefined,
    scenario: raw.scenario as string | undefined,
    welcome_message: raw[welcomeKey] as string | undefined,
    mes_example: raw.mes_example as string | undefined,
    system_prompt: raw.system_prompt as string | undefined,
    post_history_instructions: raw.post_history_instructions as string | undefined,
    alternate_greetings: raw.alternate_greetings as string[] | undefined,
    tags: raw.tags as string[] | undefined,
    creator: raw.creator as string | undefined,
    creator_notes: raw.creator_notes as string | undefined,
    character_version: raw.character_version as string | undefined,
  };
}

/**
 * Normalize a single lorebook entry, applying defaults for missing fields.
 */
export function normalizeLorebookEntry(
  entry: Record<string, unknown>,
): LorebookEntry {
  return {
    keys: (entry.keys as string[]) ?? [],
    content: (entry.content as string) ?? "",
    enabled: (entry.enabled as boolean) ?? true,
    insertion_order: (entry.insertion_order as number) ?? 0,
    case_sensitive: (entry.case_sensitive as boolean) ?? false,
    name: (entry.name as string) ?? "",
    priority: (entry.priority as number) ?? 0,
    id: (entry.id as number) ?? 0,
    comment: entry.comment as string | undefined,
    selective: (entry.selective as boolean) ?? false,
    constant: (entry.constant as boolean) ?? false,
    position: (entry.position as "before_char" | "after_char") ?? "before_char",
    use_regex: entry.use_regex as boolean | undefined,
    extensions: entry.extensions as Record<string, unknown> | undefined,
  };
}

/**
 * Build LorebookData from a raw character_book object.
 * Shared by ccv2 and ccv3 normalizers.
 */
export function buildLorebook(
  characterBook: Record<string, unknown>,
): LorebookData {
  const entries = (characterBook.entries as Record<string, unknown>[] ?? [])
    .map((e,) => normalizeLorebookEntry(e,));

  return {
    name: characterBook.name as string | undefined,
    description: characterBook.description as string | undefined,
    scan_depth: characterBook.scan_depth as number | undefined,
    token_budget: characterBook.token_budget as number | undefined,
    recursive_scanning: characterBook.recursive_scanning as boolean | undefined,
    entries,
  };
}
