// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outfit Event Regex Patterns — narrative-shaped prefilter.
 *
 * Matches third-person narration of outfit changes in **assistant replies**
 * ("Mira shed her cloak"), never imperative commands to the assistant
 * ("put on the blue dress"). Tier-agnostic: takes only reply text, returns
 * a hit + confidence + matched groups — no tier parameter, no tier import.
 *
 * Consumer: the outfit extractor ladder (classifier -> aux -> general main
 * model). A miss means "don't run any tier"; a hit spends one round trip.
 * No production caller in this ticket (leaf module).
 *
 * Modelled on `src/regex/story-events.ts`. Deliberately separate from
 * `src/regex/image-edit.ts`: its `change_outfit` (0.9) / `add_accessory` (0.7)
 * match imperative commands, not narration, with colliding confidences.
 * @module regex/outfit-events
 */

/** Garment vocabulary — closed list; a non-garment capture never matches. */
const GARMENT =
  "(?:cloak|cape|coat|jacket|dress|gown|robe|tunic|armor|armour|uniform|outfit|clothes|garb|vestments|leathers|plate|mail|surcoat|tabard|bodice|doublet|hose|breeches|trousers|skirt|blouse|shirt|boots|gloves|gauntlets|helm|helmet|hood|crown|mask|scarf|belt|sash|bandolier)";

/** Subject: proper name or pronoun — never a bare imperative verb. */
const SUBJECT = "(?:[A-Z][a-z]{1,19}|he|she|they|it|his|her|their)";

/**
 * Matches narration of donning/wearing: "he donned his armour",
 * "she was wearing a travel cloak".
 *
 * Bounded word runs (`{1,19}`) with a terminator anchor so a hostile or
 * degenerate reply cannot ReDoS the turn.
 */
export const OUTFIT_EQUIP = new RegExp(
  `${SUBJECT}\\s+(?:donned|put\\s+on|wore|was\\s+wearing|clad\\s+(?:him|her|them|it)self\\s+in|wrapped\\s+(?:him|her|them|it)self\\s+in|changed\\s+into|slipped\\s+into)\\s+(?:the\\s+|a\\s+|an\\s+|his\\s+|her\\s+|their\\s+)?((?:[a-z]{1,19}\\s+){0,2}${GARMENT}(?:\\s+[a-z]{1,19}){0,2})(?:[,.;!?]|$)`,
  "i",
);

/**
 * Matches narration of doffing/discarding: "Mira shed her cloak",
 * "Rin discarded the borrowed coat".
 *
 * Same bound/anchor rationale as {@link OUTFIT_EQUIP}.
 */
export const OUTFIT_REMOVE = new RegExp(
  `${SUBJECT}\\s+(?:shed|doffed|discarded|removed|stripped\\s+off|took\\s+off|cast\\s+off|tore\\s+off)\\s+(?:the\\s+|a\\s+|an\\s+|his\\s+|her\\s+|their\\s+)?((?:[a-z]{1,19}\\s+){0,2}${GARMENT}(?:\\s+[a-z]{1,19}){0,2})(?:[,.;!?]|$)`,
  "i",
);

/** Per-group confidences — distinct from each other and from image-edit's 0.9/0.7. */
export const OUTFIT_EQUIP_CONFIDENCE = 0.8;
export const OUTFIT_REMOVE_CONFIDENCE = 0.6;

/** Narrative outfit patterns (both groups). */
export const OUTFIT_PATTERNS = [OUTFIT_EQUIP, OUTFIT_REMOVE,] as const;

/** Matched outfit group. */
export type OutfitEventKind = "equip" | "remove";

/** Prefilter verdict — a clean negative is a first-class outcome (never throws). */
export interface OutfitPrefilterResult {
  readonly hit: boolean;
  readonly confidence: number;
  readonly kind: OutfitEventKind | null;
  readonly garment: string | null;
}

const MISS: OutfitPrefilterResult = { hit: false, confidence: 0, kind: null, garment: null, };

/**
 * Scan an assistant reply for narrative outfit changes.
 * @param reply Assistant reply text (LLM output, never user input).
 * @returns Hit + confidence + matched group, or a clean miss — never throws.
 */
export function detectOutfitEvent(reply: string,): OutfitPrefilterResult {
  try {
    const equip = OUTFIT_EQUIP.exec(reply,);
    if (equip) {
      return { hit: true, confidence: OUTFIT_EQUIP_CONFIDENCE, kind: "equip", garment: equip[1] ?? null, };
    }

    const remove = OUTFIT_REMOVE.exec(reply,);
    if (remove) {
      return { hit: true, confidence: OUTFIT_REMOVE_CONFIDENCE, kind: "remove", garment: remove[1] ?? null, };
    }

    return MISS;
  } catch {
    return MISS;
  }
}
