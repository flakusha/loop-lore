// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Entity-kind registry for story-triggered in-place generation
 * (FEAT-in-story-character-generation-via-assistant-chat-handoff).
 *
 * The flow is functionally unified across entity kinds: detection ->
 * assistant-chat handoff -> finalize -> review/approval. Each kind maps to
 * its config-driven workflow template (configs/templates/workflows/entities.yaml)
 * whose `approval: confirm` gate keeps persistence user-gated; this registry
 * only supplies the kind -> workflow/title wiring. Character is the lead
 * consumer; location/world/item reuse the identical mechanism.
 */

import type { EntityKind, } from "../prompt/templates/entity-generation";

/** Per-kind wiring for the in-place creation flow. */
export interface EntitySpecDescriptor {
  kind: EntityKind;
  /** Workflow template id resolved from config.templates.workflows. */
  workflowId: string;
  /** Creation-chat title prefix; the entity seed name is appended. */
  chatTitlePrefix: string;
}

/** Registry keyed by canonical entity kind. */
export const ENTITY_SPEC_DESCRIPTORS: Record<EntityKind, EntitySpecDescriptor> = {
  character: {
    kind: "character",
    workflowId: "entity-character",
    chatTitlePrefix: "Character creation",
  },
  location: {
    kind: "location",
    workflowId: "entity-location",
    chatTitlePrefix: "Location creation",
  },
  world: {
    kind: "world",
    workflowId: "entity-world",
    chatTitlePrefix: "World creation",
  },
  item: {
    kind: "item",
    workflowId: "entity-item",
    chatTitlePrefix: "Item creation",
  },
};

/** All kinds the in-place flow accepts (stable order for validation messages). */
export const ENTITY_SPEC_KINDS = Object.keys(ENTITY_SPEC_DESCRIPTORS,) as EntityKind[];

/**
 * Look up the descriptor for a requested kind.
 * @param kind - Raw kind string (untrusted input)
 * @returns The descriptor, or undefined when the kind is unknown
 */
export function findEntitySpec(kind: string,): EntitySpecDescriptor | undefined {
  const record = ENTITY_SPEC_DESCRIPTORS as Record<string, EntitySpecDescriptor | undefined>;
  return Object.hasOwn(record, kind,) ? record[kind] : undefined;
}

/**
 * First non-empty line of a seed, as the tentative entity name.
 * @param seed - raw seed text (untrusted input)
 * @returns the first non-empty trimmed line, or an empty string
 */
export function firstSeedLine(seed: string,): string {
  return seed.split("\n",).map((line,) => line.trim()).find((line,) => line !== "") ?? "";
}

/**
 * Build the creation-chat title for a kind + raw seed (first line = name).
 * @param descriptor - kind descriptor carrying the chat title prefix
 * @param seed - raw seed text; first non-empty line becomes the name
 * @returns the prefixed chat title, "(unnamed)" when the seed is blank
 */
export function creationChatTitle(descriptor: EntitySpecDescriptor, seed: string,): string {
  const name = firstSeedLine(seed,);
  return `${descriptor.chatTitlePrefix}: ${name === "" ? "(unnamed)" : name}`;
}
