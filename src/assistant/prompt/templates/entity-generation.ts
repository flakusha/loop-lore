// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Entity-generation prompt templates for the `/create` assistant command.
 *
 * Previously these strings were inlined in `src/assistant/commands/create.ts`.
 * They are now extracted here as the single source of truth and made
 * config-overridable via {@link resolveEntityGenerationPrompt}.
 */

// Value import — ENTITY_TEMPLATES is used lazily inside resolveEntityGenerationPrompt,
// Avoiding a circular-runtime dependency (entity-templates.ts only imports a type).
import type { Config, } from "../../../config/schema";
import {
  DEFAULT_ENTITY_TEMPLATE_POSITION,
  type EntityTemplatePosition,
} from "../../../config/sections/templates";
import { safeJsonStringify, } from "../../../utils";
import { ENTITY_TEMPLATES, } from "./entity-templates";

/** Entity kinds the `/create` command can generate. */
export type EntityKind = "character" | "npc" | "location" | "world" | "item";

/** Map a `/create` subcommand alias to its canonical entity kind. */
export const ENTITY_KIND_ALIASES: Record<string, EntityKind> = {
  char: "character",
  character: "character",
  npc: "npc",
  loc: "location",
  location: "location",
  world: "world",
  item: "item",
};

/** Valid `/create` subcommand tokens. */
export const VALID_ENTITY_TOKENS = Object.keys(ENTITY_KIND_ALIASES,);

/** Prompt body building a canonical entity shape from a description. */
type EntityPrompt = (description: string,) => string;

const LORE_SCHEMA =
  `lore (array of lore entries, optional) — each entry: name (string, required), content (string, required), keys (array of strings, max 5), subject (object with kind and selectors), requires_presence (boolean), constant (boolean), selective (boolean), position ("before_char"|"after_char"|"in_char"), insertion_order (integer), priority (integer), cooldown_seconds (integer). When selective is true, keys must be non-empty for keyword matching to activate.`;

const DEFAULT_PROMPTS: Record<EntityKind, EntityPrompt> = {
  character: (description,) =>
    `Generate a character profile from this description. Return JSON with: name (string), description (string, 1-2 paragraphs), personality (string), scenario (string, 1 sentence), ${LORE_SCHEMA} Description: ${description}`,
  npc: (description,) =>
    `Generate a non-player character from this description. Return JSON with: name (string), description (string, 1-2 paragraphs), personality (string), scenario (string, 1 sentence), ${LORE_SCHEMA} Description: ${description}`,
  location: (description,) =>
    `Generate a location from this description. Return JSON with: name (string), description (string, 1-2 paragraphs), ${LORE_SCHEMA} Description: ${description}`,
  world: (description,) =>
    `Generate a world setting from this description. Return JSON with: name (string), description (string, 1-2 paragraphs), ${LORE_SCHEMA} Description: ${description}`,
  item: (description,) =>
    `Generate an item from this description. Return JSON with: name (string), description (string, 1 paragraph), ${LORE_SCHEMA} Description: ${description}`,
};

/**
 * Build the pre-compiled schema+example block for one entity kind. The block
 * is the deterministic, schema-steered guidance appended/prepended to the
 * base instruction per the `epic-assistant-gm-flows.md` pre-compiled-templates
 * spec.
 * @param kind
 * @returns The rendered block, or empty string if it cannot be assembled
 */
function buildEntityTemplateBlock(kind: EntityKind,): string {
  const entityTemplate = ENTITY_TEMPLATES[kind];
  const exampleResult = safeJsonStringify(entityTemplate.example, 2,);
  const example = exampleResult.ok ? exampleResult.value : "{}";
  return `Follow this schema and use the example as a model:\nSchema: ${entityTemplate.schema}\nExample: ${example}`;
}

/**
 * Resolve the prompt template for an entity kind.
 *
 * Uses the config override at `config.templates.llm.entityGeneration` when
 * present, otherwise the built-in default. The override must be a full prompt
 * string containing a `{description}` placeholder; if it lacks the placeholder
 * it is appended automatically so callers can rely on substitution.
 *
 * When using the built-in default, the entity template (schema + example) from
 * {@link ENTITY_TEMPLATES} is composed into the prompt at the position
 * configured by `config.templates.llm.entityTemplatePosition`:
 * - `"after"` (default if unset): schema+example follow the base instruction
 * - `"before"`: schema+example precede the base instruction
 * - `"off"`: skip injection entirely; only the base instruction is sent
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
  if (override) {
    return override.includes("{description}",)
      ? override.replace("{description}", description,)
      : `${override} Description: ${description}`;
  }

  const template = DEFAULT_PROMPTS[kind](description,);
  const position: EntityTemplatePosition = config?.templates?.llm?.entityTemplatePosition ??
    DEFAULT_ENTITY_TEMPLATE_POSITION;

  if (position === "off") {
    return template;
  }

  const block = buildEntityTemplateBlock(kind,);
  return position === "before" ? `${block}\n\n${template}` : `${template}\n\n${block}`;
}
