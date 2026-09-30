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
 * @param {string} pluginName
 * @param {RouteDefinition[]} defs
 * @returns {void}
 */
setRoutes(pluginName: string, defs: RouteDefinition[]): void {
    this.routes.set(pluginName, defs);
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
 * @param {string} pluginName
 * @param {ToolDefinition[]} defs
 * @returns {void}
 */
setTools(pluginName: string, defs: ToolDefinition[]): void {
    this.tools.set(pluginName, defs);
  }

  /**
 * @returns {ToolDefinition[]}
 */
getAllTools(): ToolDefinition[] {
    return this.enabledDefinitions(this.tools);
  }

  /**
 * @param {string} pluginName
 * @param {AgentRoleDefinition[]} defs
 * @returns {void}
 */
setAgentRoles(pluginName: string, defs: AgentRoleDefinition[]): void {
    this.agentRoles.set(pluginName, defs);
  }

  /**
 * @returns {AgentRoleDefinition[]}
 */
getAllAgentRoles(): AgentRoleDefinition[] {
    return this.enabledDefinitions(this.agentRoles);
  }

  /**
 * @param {string} pluginName
 * @param {UIComponentDefinition[]} defs
 * @returns {void}
 */
setUIComponents(pluginName: string, defs: UIComponentDefinition[]): void {
    this.uiComponents.set(pluginName, defs);
  }

  /**
 * @returns {UIComponentDefinition[]}
 */
getAllUIComponents(): UIComponentDefinition[] {
    return this.enabledDefinitions(this.uiComponents);
  }

  /**
 * @param {string} pluginName
 * @param {EventHandlerDefinition[]} defs
 * @returns {void}
 */
setEventHandlers(pluginName: string, defs: EventHandlerDefinition[]): void {
    this.eventHandlers.set(pluginName, defs);
  }

  /**
 * @returns {EventHandlerDefinition[]}
 */
getAllEventHandlers(): EventHandlerDefinition[] {
    return this.enabledDefinitions(this.eventHandlers);
  }

  /**
 * @param {string} pluginName
 * @param {MigrationDefinition[]} defs
 * @returns {void}
 */
setMigrations(pluginName: string, defs: MigrationDefinition[]): void {
    this.migrations.set(pluginName, defs);
  }

  /**
 * @returns {MigrationDefinition[]}
 */
getAllMigrations(): MigrationDefinition[] {
    return this.enabledDefinitions(this.migrations);
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
