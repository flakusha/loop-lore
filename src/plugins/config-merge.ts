// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin config merge (FEAT-051).
 *
 * Deep-merges stored plugin config over manifest defaults, then enforces
 * `PluginConfigSchema.required` when a schema is supplied. Plain objects
 * recurse; arrays and scalars are replaced (stored wins).
 */

import type { PluginConfigSchema } from "./types";

/**
 * Check whether a value is a mergeable plain object.
 * @param value - Value to test.
 * @returns True for non-array, non-null objects.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge stored config over defaults.
 * @param defaults - Default values from the plugin manifest.
 * @param stored - Stored overrides (user/admin supplied).
 * @param schema - Optional schema; `required` keys must survive the merge.
 * @returns Merged config; `stored` wins per key.
 * @throws When a `required` schema key is missing from the merged result.
 * @example
 * mergePluginConfig({ ui: { theme: "dark", page: 1 } }, { ui: { page: 2 } });
 * // { ui: { theme: "dark", page: 2 } }
 */
export function mergePluginConfig(
  defaults: Record<string, unknown>,
  stored: Record<string, unknown>,
  schema?: PluginConfigSchema,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...defaults, };
  for (const [key, value] of Object.entries(stored)) {
    const base = merged[key];
    merged[key] = isPlainObject(base) && isPlainObject(value)
      ? mergePluginConfig(base, value)
      : value;
  }
  for (const key of schema?.required ?? []) {
    if (merged[key] === undefined) {
      throw new Error(`Plugin config missing required key: "${key}"`);
    }
  }
  return merged;
}
