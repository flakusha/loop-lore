// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin config merge placeholder (FEAT-051).
 *
 * No-op integration: merges stored plugin config over schema defaults with
 * correct I/O. Full wiring adds `PluginConfigSchema` validation of the
 * merged result.
 */

/**
 * Shallow-merge stored config over defaults.
 *
 * Placeholder: one-level spread — nested objects are replaced, not merged.
 * Schema validation lands in the full implementation.
 * @param defaults - Default values from the plugin manifest.
 * @param stored - Stored overrides (user/admin supplied).
 * @returns Merged config; `stored` wins per key.
 * @example
 * mergePluginConfig({ theme: "dark", page: 1 }, { page: 2 });
 * // { theme: "dark", page: 2 }
 */
export function mergePluginConfig(
  defaults: Record<string, unknown>,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  return { ...defaults, ...stored, };
}
