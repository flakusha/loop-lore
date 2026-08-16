// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin System — Barrel exports
 */
export { loadAllPlugins, dispatchPluginRoute, unloadAllPlugins, registry } from "./loader";
export type {
  PluginManifest,
  PluginContext,
  PluginLogger,
  PluginOrigin,
  LoadedPlugin,
  RouteDefinition,
  ToolDefinition,
  ToolResult,
  AgentRoleDefinition,
  UIComponentDefinition,
  EventHandlerDefinition,
  MigrationDefinition,
  PluginConfigSchema,
} from "./types";
