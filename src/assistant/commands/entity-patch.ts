// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared patch grammar for the B4 entity commands (`/apply`, `/add`,
 * `/clone`, `/modify`): the `key=value` parser and the JSON-patch
 * validator both work off the spec tables in `entity-patch-spec.ts`.
 */
import { safeJsonParse, safeJsonStringify, } from "../../utils";

/** Value shapes a patch field may carry. */
export type PatchFieldType = "string" | "number" | "boolean" | "json-array" | "json-object";

export interface PatchFieldSpec {
  type: PatchFieldType;
  /** Reject `key=""` (used for id-bearing fields like `parentLocationId`). */
  rejectEmpty?: boolean;
  /**
   * When set, a string value must be one of these — derived from the route's
   * coercion tables (`enumOr` in src/routes/story-items/handlers.ts for item
   * category/rarity; the enum-typed columns the world/location routes store
   * raw otherwise). Rejecting here keeps the preview honest: the route would
   * otherwise coerce (item) or store a value the DB enum never meant (world,
   * location), diverging from what the user confirmed.
   */
  allowedValues?: readonly string[];
  /**
   * For `json-object` fields: `effects`, when present, must be a JSON array —
   * `createDefinition` runs `parseItemEffects(def.properties.effects)` outside
   * any try/catch, so a non-array reaches the user as an unhandled 500 AFTER
   * they confirmed. Reject it at parse time instead.
   */
  requireEffectsArray?: boolean;
}

/** Allowed `key=value` fields for one command/kind combination. */
export type PatchSpec = Record<string, PatchFieldSpec>;

/** A parsed patch: field → typed value, exactly what the route body accepts. */
export type EntityPatch = Record<string, string | number | boolean | string[] | Record<string, unknown>>;

export type ParseEntityPatchResult =
  | { ok: true; patch: EntityPatch }
  | { ok: false; error: string };

/**
 * Parse `key=value` update pairs from raw argument text.
 *
 * Values may be quoted to include spaces; unquoted values end at whitespace.
 * Tokens that are not `key=value` pairs are ignored. A repeated key is
 * LAST-WINS: the final pair overwrites earlier ones in the returned patch
 * (only the last `connections` array survives, likewise for every other
 * field) — the same rule `parseLocationUpdates` applies for `/loc-update`.
 * @param input - raw argument text
 * @param spec - allowed fields per command/kind; anything else is rejected
 * @param label - entity kind name used in error messages
 * @returns ok with the typed patch, or an error describing the first bad pair
 */
export function parseEntityPatch(input: string, spec: PatchSpec, label: string,): ParseEntityPatchResult {
  const pairRe = /([a-zA-Z]+)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
  const patch: EntityPatch = {};
  let matched = false;

  for (const match of input.matchAll(pairRe,)) {
    matched = true;
    const key = match[1] ?? "";
    const value = match[3] ?? match[4] ?? match[5] ?? "";

    const field = spec[key];
    if (!field) {
      return {
        ok: false,
        error: `Unknown ${label} field "${key}" — allowed: ${Object.keys(spec,).join(", ",)}.`,
      };
    }

    if (field.type === "string") {
      if (field.rejectEmpty && value === "") {
        return { ok: false, error: `Field "${key}" expects an id, got "".`, };
      }

      if (field.allowedValues && !(field.allowedValues as readonly string[]).includes(value,)) {
        return {
          ok: false,
          error: `Field "${key}" expects one of: ${field.allowedValues.join(", ",)} — got "${value}".`,
        };
      }

      patch[key] = value;
      continue;
    }

    if (field.type === "number") {
      const num = Number(value,);
      if (!Number.isFinite(num,)) {
        return { ok: false, error: `Field "${key}" expects a number, got "${value}".`, };
      }

      patch[key] = num;
      continue;
    }

    if (field.type === "boolean") {
      if (value !== "true" && value !== "false") {
        return { ok: false, error: `Field "${key}" expects true or false, got "${value}".`, };
      }

      patch[key] = value === "true";
      continue;
    }

    const parsed = safeJsonParse<unknown>(value,);
    if (!parsed.ok) {
      return {
        ok: false,
        error: `Field "${key}" expects JSON (${
          field.type === "json-array" ? "an array" : "an object"
        }), got "${value}".`,
      };
    }

    if (field.type === "json-array") {
      if (!Array.isArray(parsed.value,) || !parsed.value.every((id,): id is string => typeof id === "string")) {
        return { ok: false, error: `Field "${key}" expects a JSON array of strings, e.g. ${key}='["id-1"]'.`, };
      }

      patch[key] = parsed.value;
      continue;
    }

    if (typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value,)) {
      return { ok: false, error: `Field "${key}" expects a JSON object, e.g. ${key}='{"bonus":2}'.`, };
    }

    // createDefinition's parseItemEffects(def.properties.effects) throws on a
    // non-array outside any try/catch — reject before the user confirms.
    if (field.requireEffectsArray) {
      const effects = (parsed.value as Record<string, unknown>).effects;
      if (effects !== undefined && !Array.isArray(effects,)) {
        return {
          ok: false,
          error:
            `Field "${key}" expects "effects" to be a JSON array when present, e.g. ${key}='{"effects":["burn"]}'.`,
        };
      }
    }

    patch[key] = parsed.value as Record<string, unknown>;
  }

  if (!matched) {
    return {
      ok: false,
      error: 'No patch parsed — use key=value pairs, e.g. name="Rustic Tavern".',
    };
  }

  return { ok: true, patch, };
}

/**
 * Validate an LLM-proposed JSON patch against a field spec.
 *
 * The LLM returns an object, not `key=value` text, so the same spec table
 * validates the VALUES instead of the text. Unknown keys, wrong types and
 * out-of-range enum values are rejected before the user confirms.
 * @param raw - parsed JSON object from the model
 * @param spec - allowed fields for the kind
 * @param label - entity kind name used in error messages
 * @returns ok with the typed patch, or an error describing the first bad field
 */
export function validateJsonPatch(
  raw: Record<string, unknown>,
  spec: PatchSpec,
  label: string,
): ParseEntityPatchResult {
  const patch: EntityPatch = {};
  for (const [key, value,] of Object.entries(raw,)) {
    const field = spec[key];
    if (!field) {
      return {
        ok: false,
        error: `Unknown ${label} field "${key}" — allowed: ${Object.keys(spec,).join(", ",)}.`,
      };
    }

    if (field.type === "string") {
      if (typeof value !== "string") {
        return { ok: false, error: `Field "${key}" expects a string.`, };
      }

      if (field.rejectEmpty && value === "") {
        return { ok: false, error: `Field "${key}" expects an id, got "".`, };
      }

      if (field.allowedValues && !field.allowedValues.includes(value,)) {
        return {
          ok: false,
          error: `Field "${key}" expects one of: ${field.allowedValues.join(", ",)} — got "${value}".`,
        };
      }

      patch[key] = value;
      continue;
    }

    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value,)) {
        return { ok: false, error: `Field "${key}" expects a number.`, };
      }

      patch[key] = value;
      continue;
    }

    if (field.type === "boolean") {
      if (typeof value !== "boolean") {
        return { ok: false, error: `Field "${key}" expects true or false.`, };
      }

      patch[key] = value;
      continue;
    }

    if (field.type === "json-array") {
      if (!Array.isArray(value,) || !value.every((id,): id is string => typeof id === "string")) {
        return { ok: false, error: `Field "${key}" expects a JSON array of strings.`, };
      }

      patch[key] = value;
      continue;
    }

    if (typeof value !== "object" || value === null || Array.isArray(value,)) {
      return { ok: false, error: `Field "${key}" expects a JSON object.`, };
    }

    patch[key] = value as Record<string, unknown>;
  }

  return { ok: true, patch, };
}

/** Render a parsed patch as `field → value` preview lines. */
export function formatPatch(patch: EntityPatch,): string {
  return Object.entries(patch,)
    .map(([field, value,],) => {
      const serialized = typeof value === "object" ? safeJsonStringify(value,) : { ok: true, value, };
      return `- **${field}** → ${serialized.ok ? serialized.value : ""}`;
    },)
    .join("\n",);
}

/** Route effects worth surfacing in an update preview. */
export function locationEffects(patch: EntityPatch,): string[] {
  const effects: string[] = [];
  if (patch.parentLocationId !== undefined) {
    effects.push(`Reparents this location under **${patch.parentLocationId}** (depth and cycle checks apply).`,);
  }

  if (patch.connections !== undefined) {
    effects.push("Replaces the travel connections; every id must belong to the same world.",);
  }

  return effects;
}
