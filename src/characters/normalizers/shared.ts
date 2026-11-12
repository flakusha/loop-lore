// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/normalizers/shared.ts
//
// Shared helpers for character card normalizers.
// Eliminates duplicate field-mapping and lorebook-construction logic
// across ccv2, ccv3, yaml, toml, and json-flat normalizers.

import type {
  CanonicalCharacter,
  CharacterOutfit,
  LorebookData,
  LorebookEntry,
} from "../spec";

/**
 * A card field is untyped JSON: only a real string is a string. The import
 * boundary is the only place that can check the shape, so every card field is
 * narrowed here instead of being cast and trusted downstream (a card whose
 * `personality` is a number would otherwise reach a `.trim()` and crash the
 * import with a 500).
 * @param value
 * @returns string
 */
export function cardText(value: unknown,): string {
  return typeof value === "string" ? value : "";
}

/**
 * Narrow an untyped card field to an optional string.
 * @param value
 * @returns string | undefined
 */
export function cardOptionalText(value: unknown,): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Narrow an untyped card field to a plain object - a nested card payload
 * (`extensions`, `character_book`, a native `persona`) is only an object when it
 * really is one.
 * @param value
 * @returns Record<string, unknown> | undefined
 */
export function cardObject(value: unknown,): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value,)) { return undefined; }
  return value as Record<string, unknown>;
}

/**
 * Narrow an untyped card field to a number.
 * @param value
 * @returns number | undefined
 */
export function cardNumber(value: unknown,): number | undefined {
  return typeof value === "number" && Number.isFinite(value,) ? value : undefined;
}

/**
 * Narrow an untyped card field to a list of strings.
 * @param value
 * @returns string[] | undefined
 */
export function cardTextList(value: unknown,): string[] | undefined {
  if (!Array.isArray(value,)) { return undefined; }
  return value.filter((item,): item is string => typeof item === "string");
}

/**
 * Extract card data from an envelope wrapper.
 * CCv2/CCv3 wrap their data in `{ data: { ... } }`.
 * Other formats pass data directly.
 * @param data
 * @returns void
 */
export function extractEnvelope(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const envelope = data.data;
  if (envelope && typeof envelope === "object" && !Array.isArray(envelope,)) {
    return envelope as Record<string, unknown>;
  }

  if (!data || typeof data !== "object" || Array.isArray(data,)) { return {}; }
  return data;
}

/**
 * Read the appearance a Tavern/Agnai hybrid card parks in
 * `extensions.agnai.appearance`: those cards carry no top-level `appearance`
 * field, so the value was silently dropped on import.
 * @param extensions
 * @returns string
 */
function appearanceFromExtensions(extensions: unknown,): string {
  if (!extensions || typeof extensions !== "object") { return ""; }
  const agnai = (extensions as Record<string, unknown>).agnai;
  if (!agnai || typeof agnai !== "object") { return ""; }
  const appearance = (agnai as Record<string, unknown>).appearance;
  return typeof appearance === "string" ? appearance : "";
}

/**
 * Build the common fields of a CanonicalCharacter.
 * Normalizers call this and spread any extra fields (lorebook, assets, extensions, etc.)
 * onto the result.
 * @param raw
 * @param opts
 * @param opts.welcomeKey
 * @returns void
 */
export function buildCanonicalFields(
  raw: Record<string, unknown>,
  opts?: {
    /** Field name for the welcome message (default: "first_mes") */
    welcomeKey?: string;
  },
): Omit<CanonicalCharacter, "lorebook" | "assets" | "extensions" | "nickname"> {
  const welcomeKey = opts?.welcomeKey ?? "first_mes";
  // Identity fields — accept both canonical names and legacy aliases.
  // `race` → `species` (SillyTavern V2), `origin` → `homeland` (per-character generator).
  // Canonical names win; aliases fill in when canonical is missing.
  const species = cardOptionalText(raw.species,) ?? cardOptionalText(raw.race,);
  const homeland = cardOptionalText(raw.homeland,) ?? cardOptionalText(raw.origin,);
  const culture = cardOptionalText(raw.culture,);
  const gender = cardOptionalText(raw.gender,);
  const ageRaw = raw.age;
  const age = (typeof ageRaw === "number" || typeof ageRaw === "string") ? ageRaw : undefined;
  // Wardrobe — canonical names; legacy aliases (`outfit` singular, `wardrobe`) fill in when missing.
  const outfitsRaw = raw.outfits ?? raw.wardrobe;

  const outfits: CharacterOutfit[] = Array.isArray(outfitsRaw,)
    ? outfitsRaw
      .filter((o,): o is Record<string, unknown> => !!o && typeof o === "object" && !Array.isArray(o,))
      .map((o,) => ({ id: cardText(o.id,), name: cardText(o.name,), descriptor: cardText(o.descriptor,), }))
    : [];

  // A foreign card (SillyTavern, Agnai, Character.AI) rarely carries loop-lore's
  // wardrobe or a separate personality/appearance field. The import maps the
  // card faithfully: a field the card does not have stays empty. Filling it
  // with a copy of the description would print the same prose three times
  // (card view, adapter payload, group participant) and leak a field the card
  // never had into the export.
  const description = cardText(raw.description,);
  const personality = cardText(raw.personality,);
  // A Tavern/Agnai hybrid parks its appearance in `extensions.agnai` - that is
  // the card's own field, so it is recovered instead of lost.
  const appearance = cardText(raw.appearance,) || appearanceFromExtensions(raw.extensions,);

  const defaultOutfit = cardText(raw.default_outfit,) ||
    cardText(raw.outfit,) ||
    outfits[0]?.id ||
    "";

  return {
    name: cardText(raw.name,),
    description,
    personality,
    appearance,
    default_outfit: defaultOutfit,
    outfits,
    scenario: cardOptionalText(raw.scenario,),
    welcome_message: cardOptionalText(raw[welcomeKey],),
    mes_example: cardOptionalText(raw.mes_example,),
    system_prompt: cardOptionalText(raw.system_prompt,),
    post_history_instructions: cardOptionalText(raw.post_history_instructions,),
    alternate_greetings: cardTextList(raw.alternate_greetings,),
    tags: cardTextList(raw.tags,),
    creator: cardOptionalText(raw.creator,),
    creator_notes: cardOptionalText(raw.creator_notes,),
    character_version: cardOptionalText(raw.character_version,),
    species,
    homeland,
    culture,
    gender,
    age,
  };
}

/**
 * Normalize a single lorebook entry, applying defaults for missing fields.
 * @param entry
 * @returns void
 */
export function normalizeLorebookEntry(
  entry: Record<string, unknown>,
): LorebookEntry {
  return {
    keys: cardTextList(entry.keys,) ?? [],
    content: cardText(entry.content,),
    enabled: typeof entry.enabled === "boolean" ? entry.enabled : true,
    insertion_order: cardNumber(entry.insertion_order,) ?? 0,
    case_sensitive: entry.case_sensitive === true,
    name: cardText(entry.name,),
    priority: cardNumber(entry.priority,) ?? 0,
    id: cardNumber(entry.id,) ?? 0,
    comment: cardOptionalText(entry.comment,),
    selective: entry.selective === true,
    constant: entry.constant === true,
    position: entry.position === "after_char" ? "after_char" : "before_char",
    use_regex: typeof entry.use_regex === "boolean" ? entry.use_regex : undefined,
    extensions: cardObject(entry.extensions,),
  };
}

/**
 * Build LorebookData from a raw character_book object.
 * Shared by ccv2 and ccv3 normalizers.
 * @param characterBook
 * @returns void
 */
export function buildLorebook(
  characterBook: Record<string, unknown>,
): LorebookData {
  const source = Array.isArray(characterBook.entries,) ? characterBook.entries : [];
  const entries = source.map((e,) => normalizeLorebookEntry(cardObject(e,) ?? {},));

  return {
    name: cardOptionalText(characterBook.name,),
    description: cardOptionalText(characterBook.description,),
    scan_depth: cardNumber(characterBook.scan_depth,),
    token_budget: cardNumber(characterBook.token_budget,),
    recursive_scanning: typeof characterBook.recursive_scanning === "boolean"
      ? characterBook.recursive_scanning
      : undefined,
    entries,
  };
}
