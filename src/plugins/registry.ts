// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin Registry — Stores all plugin registrations for consumers.
 * Each extension point (routes, tools, agent roles, …) has a dedicated
 * collection keyed by plugin name; consumers reach them via public getters.
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

  /** @throws When the plugin is unknown or cannot register routes. */
  addRoutes(pluginName: string, defs: RouteDefinition[]): void {
    this.assertCanRegister(pluginName, "routes");
    this.store.setRoutes(pluginName, defs);
  }

  /** @throws When the plugin is unknown or cannot register tools. */
  addTools(pluginName: string, defs: ToolDefinition[]): void {
    this.assertCanRegister(pluginName, "tools");
    this.store.setTools(pluginName, defs);
  }

  /** @throws When the plugin is unknown or cannot register agent roles. */
  addAgentRoles(pluginName: string, defs: AgentRoleDefinition[]): void {
    this.assertCanRegister(pluginName, "agentRoles");
    this.store.setAgentRoles(pluginName, defs);
  }

  /** @throws When the plugin is unknown or cannot register UI components. */
  addUIComponents(pluginName: string, defs: UIComponentDefinition[]): void {
    this.assertCanRegister(pluginName, "uiComponents");
    this.store.setUIComponents(pluginName, defs);
  }

  /** @throws When the plugin is unknown or cannot register event handlers. */
  addEventHandlers(pluginName: string, defs: EventHandlerDefinition[]): void {
    this.assertCanRegister(pluginName, "eventHandlers");
    this.store.setEventHandlers(pluginName, defs);
  }

  /** @throws When the plugin is unknown or cannot register migrations. */
  addMigrations(pluginName: string, defs: MigrationDefinition[]): void {
    this.assertCanRegister(pluginName, "migrations");
    this.store.setMigrations(pluginName, defs);
  }

  // ── Accessors ─────────────────────────────────────────────

  /** The loaded plugin, if found. */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /** All loaded plugins. */
  listPlugins(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /** Plugins matching the origin. */
  getPluginsByOrigin(origin: PluginOrigin): LoadedPlugin[] {
    const out: LoadedPlugin[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.origin === origin) { out.push(plugin); }
    }
    return out;
  }

  /** Routes from enabled plugins in registration order. */
  getAllRoutes(): RouteDefinition[] {
    return this.store.getAllRoutes();
  }

  /** Alias of {@link getAllRoutes}. */
  getEnabledRoutes(): RouteDefinition[] {
    return this.getAllRoutes();
  }

  /** Raw routes for a plugin, including disabled registrations. */
  getPluginRoutes(pluginName: string): RouteDefinition[] {
    return this.store.getPluginRoutes(pluginName);
  }

  /** Tools from enabled plugins in registration order. */
  getAllTools(): ToolDefinition[] {
    return this.store.getAllTools();
  }

  /** Agent roles from enabled plugins in registration order. */
  getAllAgentRoles(): AgentRoleDefinition[] {
    return this.store.getAllAgentRoles();
  }

  /** Look up an enabled plugin agent role by id. */
  getAgentRole(id: string): AgentRoleDefinition | undefined {
    return this.getAllAgentRoles().find((role) => role.id === id);
  }

  /** UI components from enabled plugins in registration order. */
  getAllUIComponents(): UIComponentDefinition[] {
    return this.store.getAllUIComponents();
  }

  /** Event handlers from enabled plugins in registration order. */
  getAllEventHandlers(): EventHandlerDefinition[] {
    return this.store.getAllEventHandlers();
  }

  /** Migrations from enabled plugins in registration order. */
  getAllMigrations(): MigrationDefinition[] {
    return this.store.getAllMigrations();
  }

  // ── Lifecycle ─────────────────────────────────────────────

  unregisterAll(): void {
    this.plugins.clear();
    this.store.clear();
  }

  /** Whether the plugin is enabled. */
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
