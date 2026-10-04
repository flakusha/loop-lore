// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── i18n infrastructure ──────────────────────────────────

import { interpolate, resolveKey, } from "../i18n";
import type { TranslationMap, } from "../i18n";

// Preserve server-injected translations (set by wrapWithLayout inline script).
// Only initialize to empty if the server didn't inject any.
globalThis.__localeStrings ??= {} as TranslationMap;

globalThis.__ = function(key: string, fallback?: string,): string {
  return resolveKey(globalThis.__localeStrings as TranslationMap, key,) ?? fallback ?? key;
};

/**
 * Client-side translator used by Alpine components.
 *
 * Resolves a dot-notation key against the server-injected `__localeStrings`
 * map and interpolates `{param}` placeholders. A numeric `params.count` also
 * drives plural-variant selection, matching the server translator. Falls back to
 * the key itself when the catalog is empty (e.g. in unit tests without locale
 * setup), which keeps components renderable while still surfacing missing keys.
 * @param key
 * @param params
 * @returns {string}
 */
export function t(key: string, params?: Record<string, string | number>,): string {
  const map = (globalThis.__localeStrings ?? {}) as TranslationMap;
  const count = typeof params?.count === "number" ? params.count : undefined;
  const value = resolveKey(map, key, count,);
  if (value === undefined) { return key; }
  return params ? interpolate(value, params,) : value;
}
