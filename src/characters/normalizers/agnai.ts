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
import {
  buildCanonicalFields,
  cardNumber,
  cardObject,
  cardOptionalText,
  cardText,
  cardTextList,
} from "./shared";

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
  const persona = cardObject(data.persona,);
  if (!persona) { return false; }
  if (typeof persona.kind !== "string") { return false; }
  if (!cardObject(persona.attributes,)) { return false; }
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
function personaText(name: string, persona: Record<string, unknown> | undefined,): string {
  const attributes = cardObject(persona?.attributes,);
  if (persona?.kind === "text") {
    return cardTextList(attributes?.text,)?.[0] ?? "";
  }

  const lines = Object.entries(attributes ?? {},).map(
    ([key, values,],) => `${key}: ${cardTextList(values,)?.join(", ",) ?? ""}`,
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
    keys: cardTextList(entry.keywords,) ?? [],
    content: cardText(entry.entry,),
    enabled: entry.enabled !== false,
    insertion_order: cardNumber(entry.weight,) ?? 0,
    case_sensitive: false,
    name: cardText(entry.name,),
    priority: cardNumber(entry.priority,) ?? 0,
    id: cardNumber(entry.id,) ?? index,
    comment: cardOptionalText(entry.comment,),
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
  const entries = Array.isArray(book.entries,) ? book.entries : [];

  return {
    name: cardOptionalText(book.name,),
    description: cardOptionalText(book.description,),
    scan_depth: cardNumber(book.scanDepth,),
    token_budget: cardNumber(book.tokenBudget,),
    recursive_scanning: typeof book.recursiveScanning === "boolean"
      ? book.recursiveScanning
      : undefined,
    entries: entries.map((entry, index,) => nativeLoreEntry(cardObject(entry,) ?? {}, index,)),
  };
}

/**
 * Normalize an Agnai native character to a canonical character card.
 * @param data
 * @returns CanonicalCharacter
 */
export function normalizeAgnai(data: Record<string, unknown>,): CanonicalCharacter {
  const name = cardText(data.name,);

  // Keep the Agnai-namespace payload the way the upstream Tavern export does,
  // so a native card and its Tavern twin land on the same canonical extensions.
  const extensions: Record<string, unknown> = { ...(cardObject(data.extensions,) ?? {}), };
  extensions.agnai = {
    ...(cardObject(extensions.agnai,) ?? {}),
    persona: cardObject(data.persona,),
    appearance: cardOptionalText(data.appearance,),
    voice: data.voice,
    json: data.json,
    sprite: data.sprite,
    // The depth prompt's insertion depth travels with the prompt text.
    insert: cardObject(data.insert,),
  };

  const insert = cardObject(data.insert,);
  if (typeof insert?.prompt === "string") { extensions.depth_prompt = insert.prompt; }

  return {
    ...buildCanonicalFields({
      name,
      description: personaText(name, cardObject(data.persona,),),
      creator_notes: cardOptionalText(data.description,),
      appearance: cardOptionalText(data.appearance,),
      scenario: cardOptionalText(data.scenario,),
      first_mes: cardOptionalText(data.greeting,),
      mes_example: cardOptionalText(data.sampleChat,),
      system_prompt: cardOptionalText(data.systemPrompt,),
      post_history_instructions: cardOptionalText(data.postHistoryInstructions,),
      alternate_greetings: cardTextList(data.alternateGreetings,),
      tags: cardTextList(data.tags,),
      creator: cardOptionalText(data.creator,),
      character_version: cardOptionalText(data.characterVersion,),
      culture: cardOptionalText(data.culture,),
    },),
    extensions,
    lorebook: nativeLorebook(cardObject(data.characterBook,) ?? {},),
  };
}
