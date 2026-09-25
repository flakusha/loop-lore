// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin Registry — Stores all plugin registrations for consumers
 *
 * Each extension point (routes, tools, agent roles, etc.) has a
 * dedicated collection keyed by plugin name. Consumers access them
 * through public getters.
 * @module plugin-registry
 */

import { assertPluginCanRegister } from "./registry-policy";
import { RegistryStore } from "./registry-store";
import type {
  LoadedPlugin,
  PluginOrigin,
  PluginCapability,
  RouteDefinition,
  ToolDefinition,
  AgentRoleDefinition,
  UIComponentDefinition,
  EventHandlerDefinition,
  MigrationDefinition,
} from "./types";

export { PLUGIN_ORIGIN_CAPABILITIES } from "./registry-policy";

class PluginRegistry {
  private plugins = new Map<string, LoadedPlugin>();
  private store = new RegistryStore();

  // ── Registration ──────────────────────────────────────────

  register(plugin: LoadedPlugin): void {
    const name = plugin.manifest.name;
    this.plugins.set(name, plugin);
    this.store.enable(name);
  }

  private assertCanRegister(pluginName: string, capability: PluginCapability): void {
    assertPluginCanRegister(this.plugins, pluginName, capability);
  }

  /**
   * Register plugin routes.
   * @param pluginName - Plugin owning the routes.
   * @param defs - Route definitions.
   * @throws When the plugin is unknown or cannot register routes.
   * @returns Nothing.
   */
  addRoutes(pluginName: string, defs: RouteDefinition[]): void {
    this.assertCanRegister(pluginName, "routes");
    this.store.setRoutes(pluginName, defs);
  }

  /**
   * Register plugin tools.
   * @param pluginName - Plugin owning the tools.
   * @param defs - Tool definitions.
   * @throws When the plugin is unknown or cannot register tools.
   * @returns Nothing.
   */
  addTools(pluginName: string, defs: ToolDefinition[]): void {
    this.assertCanRegister(pluginName, "tools");
    this.store.setTools(pluginName, defs);
  }

  /**
   * Register plugin agent roles.
   * @param pluginName - Plugin owning the roles.
   * @param defs - Agent role definitions.
   * @throws When the plugin is unknown or cannot register agent roles.
   * @returns Nothing.
   */
  addAgentRoles(pluginName: string, defs: AgentRoleDefinition[]): void {
    this.assertCanRegister(pluginName, "agentRoles");
    this.store.setAgentRoles(pluginName, defs);
  }

  /**
   * Register plugin UI components.
   * @param pluginName - Plugin owning the components.
   * @param defs - UI component definitions.
   * @throws When the plugin is unknown or cannot register UI components.
   * @returns Nothing.
   */
  addUIComponents(pluginName: string, defs: UIComponentDefinition[]): void {
    this.assertCanRegister(pluginName, "uiComponents");
    this.store.setUIComponents(pluginName, defs);
  }

  /**
   * Register plugin event handlers.
   * @param pluginName - Plugin owning the handlers.
   * @param defs - Event handler definitions.
   * @throws When the plugin is unknown or cannot register event handlers.
   * @returns Nothing.
   */
  addEventHandlers(pluginName: string, defs: EventHandlerDefinition[]): void {
    this.assertCanRegister(pluginName, "eventHandlers");
    this.store.setEventHandlers(pluginName, defs);
  }

  /**
   * Register plugin migrations.
   * @param pluginName - Plugin owning the migrations.
   * @param defs - Migration definitions.
   * @throws When the plugin is unknown or cannot register migrations.
   * @returns Nothing.
   */
  addMigrations(pluginName: string, defs: MigrationDefinition[]): void {
    this.assertCanRegister(pluginName, "migrations");
    this.store.setMigrations(pluginName, defs);
  }

  // ── Accessors ─────────────────────────────────────────────

  /**
   *
   * @param name
   * @returns The loaded plugin, if found.
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   *
   * @returns All loaded plugins.
   */
  listPlugins(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   *
   * @param origin
   * @returns Plugins matching the origin.
   */
  getPluginsByOrigin(origin: PluginOrigin): LoadedPlugin[] {
    const out: LoadedPlugin[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.origin === origin) { out.push(plugin); }
    }
    return out;
  }

  /**
   * Get routes from enabled plugins in registration order.
   * @returns Enabled route definitions.
   */
  getAllRoutes(): RouteDefinition[] {
    return this.store.getAllRoutes();
  }

  /**
   * Get routes from enabled plugins in registration order.
   * @returns Enabled route definitions.
   */
  getEnabledRoutes(): RouteDefinition[] {
    return this.getAllRoutes();
  }

  /**
   * Get raw routes for a plugin, including disabled registrations.
   * @param pluginName - Plugin whose routes to return.
   * @returns Registered route definitions.
   */
  getPluginRoutes(pluginName: string): RouteDefinition[] {
    return this.store.getPluginRoutes(pluginName);
  }

  /**
   * Get tools from enabled plugins in registration order.
   * @returns Enabled tool definitions.
   */
  getAllTools(): ToolDefinition[] {
    return this.store.getAllTools();
  }

  /**
   * Get agent roles from enabled plugins in registration order.
   * @returns Enabled agent role definitions.
   */
  getAllAgentRoles(): AgentRoleDefinition[] {
    return this.store.getAllAgentRoles();
  }

  /**
   * Look up an enabled plugin agent role by id.
   * @param id - Agent role id.
   * @returns The enabled role, if found.
   */
  getAgentRole(id: string): AgentRoleDefinition | undefined {
    return this.getAllAgentRoles().find((role) => role.id === id);
  }

  /**
   * Get UI components from enabled plugins in registration order.
   * @returns Enabled UI component definitions.
   */
  getAllUIComponents(): UIComponentDefinition[] {
    return this.store.getAllUIComponents();
  }

  /**
   * Get event handlers from enabled plugins in registration order.
   * @returns Enabled event handler definitions.
   */
  getAllEventHandlers(): EventHandlerDefinition[] {
    return this.store.getAllEventHandlers();
  }

  /**
   * Get migrations from enabled plugins in registration order.
   * @returns Enabled migration definitions.
   */
  getAllMigrations(): MigrationDefinition[] {
    return this.store.getAllMigrations();
  }

  // ── Lifecycle ─────────────────────────────────────────────

  unregisterAll(): void {
    this.plugins.clear();
    this.store.clear();
  }

  /** @returns Whether the plugin is enabled. */
  isEnabled(name: string): boolean {
    return this.store.isEnabled(name);
  }

  setEnabled(name: string, enabled: boolean): void {
    this.store.setEnabled(name, enabled);
  }

  listPluginStates(): { name: string; enabled: boolean }[] {
    return Array.from(this.plugins.keys(), (name) => ({
      name,
      enabled: this.isEnabled(name),
    }));
  }
}

/** Singleton registry instance */
export const registry = new PluginRegistry();
