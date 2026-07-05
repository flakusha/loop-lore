/**
 * Plugin Registry — Stores all plugin registrations for consumers
 *
 * Each extension point (routes, tools, agent roles, etc.) has a
 * dedicated collection keyed by plugin name. Consumers access them
 * through public getters.
 *
 * @module plugin-registry
 */

import type {
  LoadedPlugin,
  PluginOrigin,
  RouteDefinition,
  ToolDefinition,
  AgentRoleDefinition,
  UIComponentDefinition,
  EventHandlerDefinition,
  MigrationDefinition,
} from "./types";

class PluginRegistry {
  private plugins = new Map<string, LoadedPlugin>();
  private routes = new Map<string, RouteDefinition[]>();
  private tools = new Map<string, ToolDefinition[]>();
  private agentRoles = new Map<string, AgentRoleDefinition[]>();
  private uiComponents = new Map<string, UIComponentDefinition[]>();
  private eventHandlers = new Map<string, EventHandlerDefinition[]>();
  private migrations = new Map<string, MigrationDefinition[]>();

  // ── Registration ──────────────────────────────────────────

  register(plugin: LoadedPlugin): void {
    this.plugins.set(plugin.manifest.name, plugin);
  }

  addRoutes(pluginName: string, defs: RouteDefinition[]): void {
    this.routes.set(pluginName, defs);
  }

  addTools(pluginName: string, defs: ToolDefinition[]): void {
    this.tools.set(pluginName, defs);
  }

  addAgentRoles(pluginName: string, defs: AgentRoleDefinition[]): void {
    this.agentRoles.set(pluginName, defs);
  }

  addUIComponents(pluginName: string, defs: UIComponentDefinition[]): void {
    this.uiComponents.set(pluginName, defs);
  }

  addEventHandlers(pluginName: string, defs: EventHandlerDefinition[]): void {
    this.eventHandlers.set(pluginName, defs);
  }

  addMigrations(pluginName: string, defs: MigrationDefinition[]): void {
    this.migrations.set(pluginName, defs);
  }

  // ── Accessors ─────────────────────────────────────────────

  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  getPluginsByOrigin(origin: PluginOrigin): LoadedPlugin[] {
    return [...this.plugins.values()].filter((p) => p.origin === origin);
  }

  getAllRoutes(): RouteDefinition[] {
    return [...this.routes.values()].flat();
  }

  getPluginRoutes(pluginName: string): RouteDefinition[] {
    return this.routes.get(pluginName) ?? [];
  }

  getAllTools(): ToolDefinition[] {
    return [...this.tools.values()].flat();
  }

  getAllAgentRoles(): AgentRoleDefinition[] {
    return [...this.agentRoles.values()].flat();
  }

  getAllUIComponents(): UIComponentDefinition[] {
    return [...this.uiComponents.values()].flat();
  }

  getAllEventHandlers(): EventHandlerDefinition[] {
    return [...this.eventHandlers.values()].flat();
  }

  getAllMigrations(): MigrationDefinition[] {
    return [...this.migrations.values()].flat();
  }

  // ── Lifecycle ─────────────────────────────────────────────

  unregisterAll(): void {
    this.plugins.clear();
    this.routes.clear();
    this.tools.clear();
    this.agentRoles.clear();
    this.uiComponents.clear();
    this.eventHandlers.clear();
    this.migrations.clear();
  }
}

/** Singleton registry instance */
export const registry = new PluginRegistry();