// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/card-settings.ts
//
// Card payload that has no column of its own: an imported card's tags and the
// card's own `extensions` blob ride along in `actors.settings` (the same place
// `POST /api/actors` stores tags) and are restored on export, so an import ->
// export round trip keeps them.

import { jsonParseOr, jsonStringifyOr, } from "../utils";
import type { CanonicalCharacter, CharacterExtensions, } from "./spec";

/**
 * Parse the actor `settings` blob.
 * @param settings
 * @returns Record<string, unknown>
 */
function actorSettings(settings: string | null | undefined,): Record<string, unknown> {
  const parsed = jsonParseOr<unknown>(settings ?? "{}", null,);
  // The blob is text, not a contract: a legacy row can hold `null`, an array
  // or a bare string, and none of those carry card payload.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed,)) { return {}; }
  return parsed as Record<string, unknown>;
}

/**
 * Build the actor `settings` blob for an imported card.
 * @param character
 * @returns string
 */
export function cardSettings(character: CanonicalCharacter,): string {
  const settings: Record<string, unknown> = {};
  if (character.tags?.length) { settings.tags = character.tags; }
  if (character.extensions && Object.keys(character.extensions,).length > 0) {
    settings.extensions = character.extensions;
  }

  return jsonStringifyOr(settings, "{}",);
}

/**
 * Card tags stored in `settings.tags`.
 * @param settings
 * @returns string[] | undefined
 */
export function cardTags(settings: string | null | undefined,): string[] | undefined {
  const tags = actorSettings(settings,).tags;
  if (!Array.isArray(tags,)) { return undefined; }
  return tags.filter((tag,): tag is string => typeof tag === "string");
}

/**
 * The card extensions blob stored in `settings.extensions`.
 * @param settings
 * @returns CharacterExtensions | undefined
 */
export function cardExtensions(settings: string | null | undefined,): CharacterExtensions | undefined {
  return actorSettings(settings,).extensions as CharacterExtensions | undefined;
}
