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
  ConfigSchema,
} from "./types";
