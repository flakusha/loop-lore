// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/plugins/bundles.ts
//
// Bundle-level character requirements — the bridge between `PluginManifest`
// and the character-extension layer. A plugin declares per-bundle requirements;
// any character with `extensions.plugin_bundle === <bundle-id>` is validated
// against them.
//
// Ponytail note: this is a pure-function helper, no registry, no runtime
// wiring — consumers (validation routes, prompt assembly) call it explicitly.
// Add caching only if a slow caller shows up.

import type { BundleCharacterRequirements, } from "./types";

/**
 * Outcome of a bundle-requirements check.
 * - `valid`: true when no requirement was unmet
 * - `missing`: human-readable string array naming each failure path
 */
export interface BundleValidationOutcome {
  valid: boolean;
  missing: string[];
}

/**
 * Validate a canonical character's `extensions` block against a bundle's
 * declared requirements. Pure: returns the outcome, never throws on a
 * malformed payload (treats nullish as "missing" rather than an error).
 *
 * @param extensions - The `extensions` block (or undefined) of a character.
 * @param requirements - The bundle's requirements object.
 * @returns Outcome listing every unmet requirement.
 */
export function validateCharacterForBundle(
  extensions: Record<string, unknown> | undefined,
  requirements: BundleCharacterRequirements | undefined,
): BundleValidationOutcome {
  const missing: string[] = [];
  const ext = (extensions ?? {}) as Record<string, unknown>;

  // Required key presence (not emptiness — drafts are allowed).
  for (const key of requirements?.required ?? []) {
    if (ext[key] === undefined) {
      missing.push(`required: ${key}`);
    }
  }

  // Optional minimum length for known-array keys.
  for (const [key, min] of Object.entries(requirements?.minLength ?? {})) {
    const v = ext[key];
    if (!Array.isArray(v)) {
      missing.push(`minLength: ${key} (not an array)`);
      continue;
    }
    if (v.length < min) {
      missing.push(`minLength: ${key} < ${min}`);
    }
  }

  return { valid: missing.length === 0, missing, };
}

/**
 * Canonical fantasy-rpg bundle requirements (FEAT-2 follow-through).
 *
 * A character opting into `extensions.plugin_bundle === "fantasy-rpg"` must
 * declare at least one ability score and at least one inventory item. This
 * matches the example in `docs/spec/character-spec.md` (fantasy-rpg bundle).
 *
 * Keep this constant in code rather than a YAML until we have a configured
 * bundle loader — config-driven schema can land as a follow-up.
 */
export const FANTASY_RPG_REQUIREMENTS: BundleCharacterRequirements = {
  required: ["abilities", "inventory",],
  minLength: { inventory: 1, },
};

/**
 * Convenience lookup. Returns undefined when no requirements are registered
 * for the given bundle id (callers should treat undefined as "no enforcement").
 */
export function getRequirementsForBundle(
  bundleId: string | undefined,
): BundleCharacterRequirements | undefined {
  if (!bundleId) return undefined;
  if (bundleId === "fantasy-rpg") return FANTASY_RPG_REQUIREMENTS;
  return undefined;
}
