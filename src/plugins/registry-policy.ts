// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { LoadedPlugin, PluginCapability, PluginOrigin } from "./types";

/** Extension points allowed for each plugin provenance. */
export const PLUGIN_ORIGIN_CAPABILITIES = {
  core: ["routes", "tools", "agentRoles", "uiComponents", "eventHandlers", "migrations"],
  community: ["routes", "tools", "agentRoles", "uiComponents", "eventHandlers"],
  local: ["routes", "tools", "agentRoles", "uiComponents", "eventHandlers", "migrations"],
} as const satisfies Record<PluginOrigin, readonly PluginCapability[]>;

/** Assert that a registered plugin may register an extension point. */
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
