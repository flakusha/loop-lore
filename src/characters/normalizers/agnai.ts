// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/agnai.ts
//
// Agnai native character normalizer.
//
// The native JSON (agnaistic/agnai `AppSchema.Character`) carries no `spec`
// wrapper, so the parser used to fall through to the Character.AI branch and
// dropped the persona bag, sampleChat, scenario and extensions. The mapping
// mirrors upstream `common/characters.ts` (`exportCharacter`), which is where
// Agnai itself decides what a native character means on its Tavern export.

import type { CanonicalCharacter, LorebookData, LorebookEntry, } from "../spec";
import { buildCanonicalFields, } from "./shared";

interface AgnaiPersona {
  kind?: string;
  attributes?: Record<string, string[]>;
}

interface AgnaiData {
  name?: string;
  /** Upstream maps the native `description` to `creator_notes` on export. */
  description?: string;
  appearance?: string;
  persona?: AgnaiPersona;
  greeting?: string;
  sampleChat?: string;
  scenario?: string;
  systemPrompt?: string;
  postHistoryInstructions?: string;
  alternateGreetings?: string[];
  tags?: string[];
  creator?: string;
  characterVersion?: string;
  culture?: string;
  insert?: { depth?: number; prompt?: string };
  characterBook?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
  voice?: unknown;
  json?: unknown;
  sprite?: unknown;
}

/** Native-only fields - their presence next to a persona bag identifies the format. */
const AGNAI_MARKERS = [
  "sampleChat",
  "greeting",
  "postHistoryInstructions",
  "systemPrompt",
  "alternateGreetings",
  "characterBook",
  "insert",
] as const;

/**
 * True when the payload is an Agnai native character.
 * The persona bag (`persona.kind` + `persona.attributes`) is the strong signal - no
 * other card format carries it - and a native-only field confirms the shape.
 * @param data
 * @returns boolean
 */
export function isAgnaiNative(data: Record<string, unknown>,): boolean {
  const persona = data.persona as AgnaiPersona | undefined;
  if (!persona || typeof persona !== "object") { return false; }
  if (typeof persona.kind !== "string") { return false; }
  if (!persona.attributes || typeof persona.attributes !== "object") { return false; }
  return AGNAI_MARKERS.some((marker,) => marker in data);
}

/**
 * Render the persona bag as prose, mirroring upstream `formatCharacter` for the
 * `attributes` kind ("Name: Aria\nspecies: elf").
 * ponytail: the `wpp`/`sbf`/`boostyle` kinds render as plain `key: value` lines
 * instead of their bracket syntax - the values survive, the cosmetic syntax does
 * not; restore the upstream renderer if those kinds show up in the wild.
 * @param name
 * @param persona
 * @returns string
 */
function personaText(name: string, persona: AgnaiPersona | undefined,): string {
  const attributes = persona?.attributes ?? {};
  if (persona?.kind === "text") {
    return attributes.text?.[0] ?? "";
  }

  const lines = Object.entries(attributes,).map(
    ([key, values,],) => `${key}: ${(values ?? []).join(", ",)}`,
  );

  // Upstream leads with the name, so a persona bag with no attributes still
  // yields a non-empty description - the import gate needs one.
  return [`Name: ${name}`, ...lines,].join("\n",);
}

/**
 * Map one native memory entry to a card lorebook entry (upstream
 * `nativeToMemoryEntry`): `entry` is the text, `keywords` the trigger keys and
 * `weight` the insertion order.
 * @param entry
 * @param index
 * @returns LorebookEntry
 */
function nativeLoreEntry(entry: Record<string, unknown>, index: number,): LorebookEntry {
  return {
    keys: (entry.keywords as string[]) ?? [],
    content: (entry.entry as string) ?? "",
    enabled: entry.enabled !== false,
    insertion_order: (entry.weight as number) ?? 0,
    case_sensitive: false,
    name: (entry.name as string) ?? "",
    priority: (entry.priority as number) ?? 0,
    id: (entry.id as number) ?? index,
    comment: entry.comment as string | undefined,
    selective: entry.selective === true,
    constant: entry.constant === true,
    position: entry.position === "after_char" ? "after_char" : "before_char",
  };
}

/**
 * Map an Agnai native memory book to a card lorebook (upstream
 * `nativeToCharacterBook`).
 * @param book
 * @returns LorebookData
 */
function nativeLorebook(book: Record<string, unknown>,): LorebookData {
  const entries = Array.isArray(book.entries,)
    ? book.entries as Record<string, unknown>[]
    : [];

  return {
    name: book.name as string | undefined,
    description: book.description as string | undefined,
    scan_depth: book.scanDepth as number | undefined,
    token_budget: book.tokenBudget as number | undefined,
    recursive_scanning: book.recursiveScanning as boolean | undefined,
    entries: entries.map((entry, index,) => nativeLoreEntry(entry, index,)),
  };
}

/**
 * Normalize an Agnai native character to a canonical character card.
 * @param data
 * @returns CanonicalCharacter
 */
export function normalizeAgnai(data: Record<string, unknown>,): CanonicalCharacter {
  const card = data as AgnaiData;
  const name = card.name ?? "";

  // Keep the Agnai-namespace payload the way the upstream Tavern export does,
  // so a native card and its Tavern twin land on the same canonical extensions.
  const extensions: Record<string, unknown> = { ...(card.extensions ?? {}), };
  extensions.agnai = {
    ...((extensions.agnai as Record<string, unknown> | undefined) ?? {}),
    persona: card.persona,
    appearance: card.appearance,
    voice: card.voice,
    json: card.json,
    sprite: card.sprite,
  };

  if (card.insert?.prompt) { extensions.depth_prompt = card.insert.prompt; }

  return {
    ...buildCanonicalFields({
      name,
      description: personaText(name, card.persona,),
      creator_notes: card.description,
      appearance: card.appearance,
      scenario: card.scenario,
      first_mes: card.greeting,
      mes_example: card.sampleChat,
      system_prompt: card.systemPrompt,
      post_history_instructions: card.postHistoryInstructions,
      alternate_greetings: card.alternateGreetings,
      tags: card.tags,
      creator: card.creator,
      character_version: card.characterVersion,
      culture: card.culture,
    },),
    extensions,
    lorebook: card.characterBook ? nativeLorebook(card.characterBook,) : undefined,
  };
}
