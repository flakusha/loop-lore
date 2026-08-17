// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Entity-generation prompt templates for the `/create` assistant command.
 *
 * Previously these strings were inlined in `src/assistant/commands/create.ts`.
 * They are now extracted here as the single source of truth and made
 * config-overridable via {@link resolveEntityGenerationPrompt}.
 */

import type { Config, } from "../../../config/schema";

/** Entity kinds the `/create` command can generate. */
export type EntityKind = "character" | "location" | "world" | "item";

/** Map a `/create` subcommand alias to its canonical entity kind. */
export const ENTITY_KIND_ALIASES: Record<string, EntityKind> = {
  char: "character",
  character: "character",
  loc: "location",
  location: "location",
  world: "world",
  item: "item",
};

/** Valid `/create` subcommand tokens. */
export const VALID_ENTITY_TOKENS = Object.keys(ENTITY_KIND_ALIASES,);

/** Prompt body building a canonical entity shape from a description. */
type EntityPrompt = (description: string,) => string;

const DEFAULT_PROMPTS: Record<EntityKind, EntityPrompt> = {
  character: (description,) =>
    `Generate a character profile from this description. Return JSON with: name (string), description (string, 1-2 paragraphs), personality (string), scenario (string, 1 sentence). Description: ${description}`,
  location: (description,) =>
    `Generate a location from this description. Return JSON with: name (string), description (string, 1-2 paragraphs). Description: ${description}`,
  world: (description,) =>
    `Generate a world setting from this description. Return JSON with: name (string), description (string, 1-2 paragraphs), lore (string, 1 paragraph). Description: ${description}`,
  item: (description,) =>
    `Generate an item from this description. Return JSON with: name (string), description (string, 1 paragraph). Description: ${description}`,
};

/**
 * Resolve the prompt template for an entity kind.
 *
 * Uses the config override at `config.templates.llm.entityGeneration` when
 * present, otherwise the built-in default. The override must be a full prompt
 * string containing a `{description}` placeholder; if it lacks the placeholder
 * it is appended automatically so callers can rely on substitution.
 *
 * @param config - Active resolved config (may be undefined in tests)
 * @param kind - Canonical entity kind
 * @param description - User-supplied description to embed
 * @returns Fully-rendered user-prompt string
 */
export function resolveEntityGenerationPrompt(
  config: Config | undefined,
  kind: EntityKind,
  description: string,
): string {
  const override = config?.templates?.llm?.entityGeneration?.[kind];
  const template = override ?? DEFAULT_PROMPTS[kind](description,);
  if (override) {
    return template.includes("{description}",)
      ? template.replace("{description}", description,)
      : `${template} Description: ${description}`;
  }
  return template;
}
