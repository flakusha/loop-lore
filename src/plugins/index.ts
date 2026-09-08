// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin System — Barrel exports
 */
export { loadAllPlugins, dispatchPluginRoute, unloadAllPlugins, registry } from "./loader";
export { emitPluginEvent, type EmitOptions } from "./event-bus";
export { executePluginTool, DEFAULT_TOOL_TIMEOUT_MS } from "./tool-executor";
export {
  getComponentsForMountPoint,
  KNOWN_MOUNT_POINTS,
  type MountPointLocation,
} from "./mount-points";
export { mergePluginConfig } from "./config-merge";
export type {
  PluginManifest,
  PluginContext,
  PluginLogger,
  PluginOrigin,
  LoadedPlugin,
  RouteDefinition,
  ToolDefinition,
  ToolResult,
  ToolExecutionContext,
  AgentRoleDefinition,
  UIComponentDefinition,
  EventHandlerDefinition,
  MigrationDefinition,
  PluginConfigSchema,
} from "./types";
