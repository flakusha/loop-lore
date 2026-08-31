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

/**
 *
 */
class PluginRegistry {
  private plugins = new Map<string, LoadedPlugin>();
  private routes = new Map<string, RouteDefinition[]>();
  private tools = new Map<string, ToolDefinition[]>();
  private agentRoles = new Map<string, AgentRoleDefinition[]>();
  private uiComponents = new Map<string, UIComponentDefinition[]>();
  private eventHandlers = new Map<string, EventHandlerDefinition[]>();
  private migrations = new Map<string, MigrationDefinition[]>();
  private enabledMap = new Map<string, boolean>();

  // ── Registration ──────────────────────────────────────────

  /**
   *
   * @param plugin
   */
  register(plugin: LoadedPlugin): void {
    this.plugins.set(plugin.manifest.name, plugin);
    this.enabledMap.set(plugin.manifest.name, true);
  }

  /**
   *
   * @param pluginName
   * @param defs
   */
  addRoutes(pluginName: string, defs: RouteDefinition[]): void {
    this.routes.set(pluginName, defs);
  }

  /**
   *
   * @param pluginName
   * @param defs
   */
  addTools(pluginName: string, defs: ToolDefinition[]): void {
    this.tools.set(pluginName, defs);
  }

  /**
   *
   * @param pluginName
   * @param defs
   */
  addAgentRoles(pluginName: string, defs: AgentRoleDefinition[]): void {
    this.agentRoles.set(pluginName, defs);
  }

  /**
   *
   * @param pluginName
   * @param defs
   */
  addUIComponents(pluginName: string, defs: UIComponentDefinition[]): void {
    this.uiComponents.set(pluginName, defs);
  }

  /**
   *
   * @param pluginName
   * @param defs
   */
  addEventHandlers(pluginName: string, defs: EventHandlerDefinition[]): void {
    this.eventHandlers.set(pluginName, defs);
  }

  /**
   *
   * @param pluginName
   * @param defs
   */
  addMigrations(pluginName: string, defs: MigrationDefinition[]): void {
    this.migrations.set(pluginName, defs);
  }

  // ── Accessors ─────────────────────────────────────────────

  /**
   *
   * @param name
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   *
   */
  listPlugins(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   *
   * @param origin
   */
  getPluginsByOrigin(origin: PluginOrigin): LoadedPlugin[] {
    const out: LoadedPlugin[] = [];
    for (const p of this.plugins.values()) {
      if (p.origin === origin) { out.push(p); }
    }
    return out;
  }

  /**
   *
   */
  getAllRoutes(): RouteDefinition[] {
    const out: RouteDefinition[] = [];
    for (const defs of this.routes.values()) {
      for (const r of defs) { out.push(r); }
    }
    return out;
  }

  /**
   *
   * @param pluginName
   */
  getPluginRoutes(pluginName: string): RouteDefinition[] {
    return this.routes.get(pluginName) ?? [];
  }

  /**
   *
   */
  getAllTools(): ToolDefinition[] {
    const out: ToolDefinition[] = [];
    for (const defs of this.tools.values()) {
      for (const t of defs) { out.push(t); }
    }
    return out;
  }

  /**
   *
   */
  getAllAgentRoles(): AgentRoleDefinition[] {
    const out: AgentRoleDefinition[] = [];
    for (const defs of this.agentRoles.values()) {
      for (const r of defs) { out.push(r); }
    }
    return out;
  }

  /**
   * Look up a single agent role by its id across all plugins.
   * @param id
   */
  getAgentRole(id: string): AgentRoleDefinition | undefined {
    return this.getAllAgentRoles().find((r,) => r.id === id,);
  }

  /**
   *
   */
  getAllUIComponents(): UIComponentDefinition[] {
    const out: UIComponentDefinition[] = [];
    for (const defs of this.uiComponents.values()) {
      for (const c of defs) { out.push(c); }
    }
    return out;
  }

  /**
   *
   */
  getAllEventHandlers(): EventHandlerDefinition[] {
    const out: EventHandlerDefinition[] = [];
    for (const defs of this.eventHandlers.values()) {
      for (const h of defs) { out.push(h); }
    }
    return out;
  }

  /**
   *
   */
  getAllMigrations(): MigrationDefinition[] {
    const out: MigrationDefinition[] = [];
    for (const defs of this.migrations.values()) {
      for (const m of defs) { out.push(m); }
    }
    return out;
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /**
   *
   */
  unregisterAll(): void {
    this.plugins.clear();
    this.routes.clear();
    this.tools.clear();
    this.agentRoles.clear();
    this.uiComponents.clear();
    this.eventHandlers.clear();
    this.migrations.clear();
    this.enabledMap.clear();
  }

  /**
   *
   * @param name
   */
  isEnabled(name: string): boolean {
    return this.enabledMap.get(name) ?? false;
  }

  /**
   *
   * @param name
   * @param enabled
   */
  setEnabled(name: string, enabled: boolean): void {
    this.enabledMap.set(name, enabled);
  }

  /**
   *
   */
  listPluginStates(): { name: string; enabled: boolean }[] {
    return Array.from(this.plugins.keys(), (name) => ({
      name,
      enabled: this.isEnabled(name),
    }));
  }
}

/** Singleton registry instance */
export const registry = new PluginRegistry();
