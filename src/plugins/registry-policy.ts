// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { LoadedPlugin, PluginCapability, PluginOrigin } from "./types";

/** Extension points allowed for each plugin provenance. */
export const PLUGIN_ORIGIN_CAPABILITIES = {
  core: ["routes", "tools", "agentRoles", "uiComponents", "eventHandlers", "migrations"],
  community: ["routes", "tools", "agentRoles", "uiComponents", "eventHandlers"],
  local: ["routes", "tools", "agentRoles", "uiComponents", "eventHandlers", "migrations"],
} as const satisfies Record<PluginOrigin, readonly PluginCapability[]>;

/**
 * Normalize a plugin route path for registration and dispatch: collapse a
 * trailing slash so `/widget/` and `/widget` are the same route
 * (BUG-fix-plugins-define-plugin-route-matching-semantics).
 * @param path - registered or requested path
 * @returns the normalized path (root "/" is preserved)
 */
export function normalizePluginRoutePath(path: string,): string {
  if (path.length > 1 && path.endsWith("/",)) { return path.slice(0, -1,); }
  return path;
}

/**
 * Reject parameterized plugin route paths at registration time.
 *
 * Plugin routes are matched by exact (normalized) path only — a `:param`
 * segment can never match, so registering one is a latent 404. Failing here
 * turns the silent dead route into a load-time error naming the plugin.
 * @param {string} pluginName
 * @param {string} path
 * @throws {Error} When any path segment starts with ":"
 * @returns {void}
 */
export function assertPluginRoutePath(pluginName: string, path: string,): void {
  const parameterized = path.split("/",).some((segment,) => segment.startsWith(":",),);
  if (parameterized) {
    throw new Error(
      `Plugin "${pluginName}" route path "${path}" contains a :param segment. ` +
        "Plugin routes are matched by exact normalized path only and cannot take URL parameters; " +
        "pass the id in the query string or body instead.",
    );
  }
}

/**
 * Assert that a registered plugin may register an extension point.
 * @param {ReadonlyMap<string, LoadedPlugin>} plugins
 * @param {string} pluginName
 * @param {PluginCapability} capability
 * @throws {Error}
 * @throws {Error}
 * @returns {void}
 */
export function assertPluginCanRegister(
  plugins: ReadonlyMap<string, LoadedPlugin>,
  pluginName: string,
  capability: PluginCapability,
): void {
  const plugin = plugins.get(pluginName);
  if (!plugin && pluginName !== "core") {
    throw new Error(`Cannot register ${capability} for unregistered plugin "${pluginName}"`);
  }

  const origin = plugin?.origin ?? "core";
  if (!PLUGIN_ORIGIN_CAPABILITIES[origin].some((allowed) => allowed === capability)) {
    throw new Error(`Plugin "${pluginName}" (${origin}) cannot register ${capability}`);
  }
}
