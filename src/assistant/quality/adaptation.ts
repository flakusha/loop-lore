// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Adaptation quality gates (epic batch B5).
 *
 * Pure half of the `/adapt` pipeline: the adaptable-field vocabulary per
 * entity kind, the LLM prompt builder, and the parser/validator for the
 * model's proposed field changes. The command handler (`commands/adapt.ts`)
 * composes these with the shared `/create` gates (`runQualityGates`) — schema
 * validation is a hard reject, duplicate/consistency stay advisory.
 */

import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import type { AdaptEntityKind, } from "../adapter/entity";

/** One context-aware field change proposed by the adaptation model. */
export interface FieldChange {
  field: string;
  oldValue: string | null;
  newValue: string;
  reason: string;
}

/** The fields each kind may adapt, keyed by the create-route field names. */
export const ADAPTABLE_FIELDS: Readonly<Record<AdaptEntityKind, readonly string[]>> = {
  character: ["appearance", "description", "personality", "scenario",],
  location: ["description", "kind",],
  item: ["category", "description", "rarity",],
};

/** The adaptation request shape shared by the prompt and the result. */
export interface AdaptationRequestInput {
  kind: AdaptEntityKind;
  sourceName: string;
  sourceFields: Record<string, unknown>;
  adaptFields: readonly string[];
  targetWorldName: string;
  targetWorldContext: string;
}

/**
 * Build the adaptation prompt: target-world context first, then the entity
 * card restricted to the requested fields, then the strict JSON contract.
 * @param request - the adaptation inputs
 * @returns the user prompt text
 */
export function buildAdaptationPrompt(request: AdaptationRequestInput,): string {
  const allowed = ADAPTABLE_FIELDS[request.kind];
  const requested = request.adaptFields.length > 0 ? request.adaptFields : [...allowed,];
  const card = requested
    .map((field,) => `${field}: ${jsonStringifyOr(request.sourceFields[field] ?? null,)}`)
    .join("\n",);

  return [
    `Target world: ${request.targetWorldName}`,
    request.targetWorldContext,
    "",
    `Adapt the "${request.kind}" "${request.sourceName}" to fit this world.`,
    `Fields to adapt (only these): ${requested.join(", ",)}`,
    card,
    "",
    'Return ONLY JSON: {"changes": [{"field": string, "newValue": string, "reason": string}]}',
  ].join("\n",);
}

export type ParsedAdaptationChanges =
  | { ok: true; changes: FieldChange[] }
  | { ok: false; error: string };

/**
 * Parse and validate the model's proposed changes: fences tolerated, every
 * change must target an adaptable field and carry a non-empty string value.
 * @param raw - the model's completion text
 * @param kind - entity kind selecting the adaptable-field vocabulary
 * @param adaptFields - optional caller restriction; empty = all adaptable fields
 * @returns the validated changes, or a rejection reason
 */
export function parseAdaptationChanges(
  raw: string,
  kind: AdaptEntityKind,
  adaptFields: readonly string[],
): ParsedAdaptationChanges {
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/, "",).replace(/\n?```\s*$/, "",);
  const parsed = safeJsonParse<{ changes?: unknown }>(cleaned,);
  if (!parsed.ok || !Array.isArray(parsed.value.changes,)) {
    return { ok: false, error: "the model did not return a changes list", };
  }

  const allowed = ADAPTABLE_FIELDS[kind];
  const restricted = adaptFields.length > 0 ? adaptFields : [...allowed,];
  const changes: FieldChange[] = [];

  for (const entry of parsed.value.changes) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "a change entry is not an object", };
    }

    const { field, newValue, reason, } = entry as Record<string, unknown>;
    if (typeof field !== "string" || !allowed.includes(field,)) {
      return { ok: false, error: `change targets non-adaptable field ${jsonStringifyOr(field,)}`, };
    }

    if (!restricted.includes(field,)) {
      return { ok: false, error: `change targets field ${field} outside the requested set`, };
    }

    if (typeof newValue !== "string" || newValue.trim() === "") {
      return { ok: false, error: `change for ${field} has no string value`, };
    }

    changes.push({
      field,
      oldValue: null,
      newValue: newValue.trim(),
      reason: typeof reason === "string" && reason.trim() !== "" ? reason.trim() : "fits the target world",
    },);
  }

  if (changes.length === 0) {
    return { ok: false, error: "the model proposed no changes", };
  }

  return { ok: true, changes, };
}

/**
 * Apply validated changes to the source fields, producing the merged draft
 * the create-entity confirm route persists in the target world.
 * @param sourceFields - the source entity's fields
 * @param changes - validated changes
 * @returns the merged fields (source values where unchanged)
 */
export function applyAdaptationChanges(
  sourceFields: Record<string, unknown>,
  changes: readonly FieldChange[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...sourceFields, };
  for (const change of changes) {
    merged[change.field] = change.newValue;
  }

  return merged;
}
