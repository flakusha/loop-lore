// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  RouteDefinition,
  ToolDefinition,
  AgentRoleDefinition,
  UIComponentDefinition,
  EventHandlerDefinition,
  MigrationDefinition,
} from "./types";

/** Stores per-plugin extension definitions and enabled state. */
export class RegistryStore {
  private routes = new Map<string, RouteDefinition[]>();
  private tools = new Map<string, ToolDefinition[]>();
  private agentRoles = new Map<string, AgentRoleDefinition[]>();
  private uiComponents = new Map<string, UIComponentDefinition[]>();
  private eventHandlers = new Map<string, EventHandlerDefinition[]>();
  private migrations = new Map<string, MigrationDefinition[]>();
  private enabledMap = new Map<string, boolean>();

  /**
 * @param {string} name
 * @returns {void}
 */
enable(name: string): void {
    if (!this.enabledMap.has(name)) this.enabledMap.set(name, true);
  }

  /**
 * @param {string} name
 * @returns {boolean}
 */
isEnabled(name: string): boolean {
    // The fallback only covers "core" — the pseudo-plugin the builtin tools
    // register under without a LoadedPlugin. Every real plugin gets an
    // explicit entry from `enable()`/`setEnabled()` during load, so an
    // unapproved community plugin cannot fall through to enabled here.
    return this.enabledMap.get(name) ?? name === "core";
  }

  /**
 * @param {string} name
 * @param {boolean} enabled
 * @returns {void}
 */
setEnabled(name: string, enabled: boolean): void {
    this.enabledMap.set(name, enabled);
  }

  /**
 * Append route definitions for a plugin. Concatenates with any defs the
 * plugin already registered, so manifest-declared routes and
 * onLoad-registered routes coexist instead of replacing each other
 * (BUG-fix-plugins-append-onload-registrations-to-manifest-registra).
 * @param {string} pluginName
 * @param {RouteDefinition[]} defs
 * @returns {void}
 */
appendRoutes(pluginName: string, defs: RouteDefinition[],): void {
    this.routes.set(pluginName, [...(this.routes.get(pluginName,) ?? []), ...defs],);
  }

  /**
 * @param {string} pluginName
 * @returns {RouteDefinition[]}
 */
getPluginRoutes(pluginName: string): RouteDefinition[] {
    return this.routes.get(pluginName) ?? [];
  }

  /**
 * @returns {RouteDefinition[]}
 */
getAllRoutes(): RouteDefinition[] {
    return this.enabledDefinitions(this.routes);
  }

  /**
 * First registered definition matching method + normalized path, across all
 * plugins in registration order (enabled state is NOT consulted — callers
 * decide whether disabled registrations count).
 * @param {string} method
 * @param {string} normalizedPath - already run through normalizePluginRoutePath
 * @returns {RouteDefinition | undefined}
 */
findRoute(method: string, normalizedPath: string,): RouteDefinition | undefined {
    for (const defs of this.routes.values()) {
      const hit = defs.find((def,) => def.method === method && def.path === normalizedPath,);
      if (hit) { return hit; }
    }

    return undefined;
  }

  /**
 * Append tool definitions for a plugin (see {@link appendRoutes}).
 * @param {string} pluginName
 * @param {ToolDefinition[]} defs
 * @returns {void}
 */
appendTools(pluginName: string, defs: ToolDefinition[],): void {
    this.tools.set(pluginName, [...(this.tools.get(pluginName,) ?? []), ...defs],);
  }

  /**
 * @returns {ToolDefinition[]}
 */
getAllTools(): ToolDefinition[] {
    return this.enabledDefinitions(this.tools);
  }

  /**
 * Append agent-role definitions for a plugin (see {@link appendRoutes}).
 * @param {string} pluginName
 * @param {AgentRoleDefinition[]} defs
 * @returns {void}
 */
appendAgentRoles(pluginName: string, defs: AgentRoleDefinition[],): void {
    this.agentRoles.set(pluginName, [...(this.agentRoles.get(pluginName,) ?? []), ...defs],);
  }

  /**
 * @returns {AgentRoleDefinition[]}
 */
getAllAgentRoles(): AgentRoleDefinition[] {
    return this.enabledDefinitions(this.agentRoles);
  }

  /**
 * Append UI-component definitions for a plugin (see {@link appendRoutes}).
 * @param {string} pluginName
 * @param {UIComponentDefinition[]} defs
 * @returns {void}
 */
appendUIComponents(pluginName: string, defs: UIComponentDefinition[],): void {
    this.uiComponents.set(pluginName, [...(this.uiComponents.get(pluginName,) ?? []), ...defs],);
  }

  /**
 * @returns {UIComponentDefinition[]}
 */
getAllUIComponents(): UIComponentDefinition[] {
    return this.enabledDefinitions(this.uiComponents);
  }

  /**
 * Append event-handler definitions for a plugin (see {@link appendRoutes}).
 * @param {string} pluginName
 * @param {EventHandlerDefinition[]} defs
 * @returns {void}
 */
appendEventHandlers(pluginName: string, defs: EventHandlerDefinition[],): void {
    this.eventHandlers.set(pluginName, [...(this.eventHandlers.get(pluginName,) ?? []), ...defs],);
  }

  /**
 * @returns {EventHandlerDefinition[]}
 */
getAllEventHandlers(): EventHandlerDefinition[] {
    return this.enabledDefinitions(this.eventHandlers);
  }

  /**
 * Append migration definitions for a plugin (see {@link appendRoutes}).
 * @param {string} pluginName
 * @param {MigrationDefinition[]} defs
 * @returns {void}
 */
appendMigrations(pluginName: string, defs: MigrationDefinition[],): void {
    this.migrations.set(pluginName, [...(this.migrations.get(pluginName,) ?? []), ...defs],);
  }

  /**
 * @returns {MigrationDefinition[]}
 */
getAllMigrations(): MigrationDefinition[] {
    return this.enabledDefinitions(this.migrations);
  }

  /**
 * @param pluginName key under which every registry was stored
 * @returns {void}
 */
removePlugin(pluginName: string): void {
    this.routes.delete(pluginName);
    this.tools.delete(pluginName);
    this.agentRoles.delete(pluginName);
    this.uiComponents.delete(pluginName);
    this.eventHandlers.delete(pluginName);
    this.migrations.delete(pluginName);
    this.enabledMap.delete(pluginName);
  }

  /**
   * @returns {void}
   */
clear(): void {
    this.routes.clear();
    this.tools.clear();
    this.agentRoles.clear();
    this.uiComponents.clear();
    this.eventHandlers.clear();
    this.migrations.clear();
    this.enabledMap.clear();
  }

  /**
 * @param {Map<string, T[]>} definitions
 * @returns {T[]}
 */
private enabledDefinitions<T>(definitions: Map<string, T[]>): T[] {
    const out: T[] = [];
    for (const [name, defs] of definitions) {
      if (!this.isEnabled(name)) continue;
      out.push(...defs);
    }

    return out;
  }
}
