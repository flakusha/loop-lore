// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Entity-suggestion collection (FEAT-in-story-character-generation-via-
 * assistant-chat-handoff).
 *
 * Stateless alternative to a persisted suggestion pipeline: recent chat
 * narration is re-scanned on read with the advisory regex detector, so no
 * schema or background job is needed and a miss never blocks the story.
 * Pure — the route fetches rows, this module only shapes them.
 */

import {
  buildEntitySeed,
  detectStoryEntityIntroductions,
  type StoryEntityIntroduction,
} from "../../regex/entity-intent";

/** Minimal message shape the collector needs. */
export interface SuggestionSourceMessage {
  role: string;
  content: string;
}

/** One surfaced suggestion for the GM panel. */
export interface EntitySuggestion {
  kind: StoryEntityIntroduction["kind"];
  name: string;
  /** Seed text prefilled into the creation-chat handoff. */
  seed: string;
}

/** Roles whose messages carry story narration worth scanning. */
const NARRATION_ROLES = new Set(["character", "assistant", "system",],);

/** Maximum suggestions surfaced per chat read. */
export const ENTITY_SUGGESTION_LIMIT = 5;

/**
 * Scan recent narration (oldest-last order) and return deduplicated
 * entity suggestions, newest detection first.
 *
 * @param messages - Recent messages, newest first; only narration roles scanned
 * @returns Up to {@link ENTITY_SUGGESTION_LIMIT} unique (kind, name) suggestions
 */
export function collectEntitySuggestions(
  messages: readonly SuggestionSourceMessage[],
): EntitySuggestion[] {
  const seen = new Set<string>();
  const suggestions: EntitySuggestion[] = [];

  for (const message of messages) {
    if (!NARRATION_ROLES.has(message.role,)) { continue; }
    for (const intro of detectStoryEntityIntroductions(message.content,)) {
      const key = intro.name.toLowerCase();
      if (seen.has(key,)) { continue; }
      seen.add(key,);
      suggestions.push({
        kind: intro.kind,
        name: intro.name,
        seed: buildEntitySeed(intro, message.content,),
      },);
      if (suggestions.length >= ENTITY_SUGGESTION_LIMIT) { return suggestions; }
    }
  }
  return suggestions;
}
