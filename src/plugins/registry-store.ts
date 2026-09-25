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

  enable(name: string): void {
    if (!this.enabledMap.has(name)) this.enabledMap.set(name, true);
  }

  isEnabled(name: string): boolean {
    return this.enabledMap.get(name) ?? name === "core";
  }

  setEnabled(name: string, enabled: boolean): void {
    this.enabledMap.set(name, enabled);
  }

  setRoutes(pluginName: string, defs: RouteDefinition[]): void {
    this.routes.set(pluginName, defs);
  }

  getPluginRoutes(pluginName: string): RouteDefinition[] {
    return this.routes.get(pluginName) ?? [];
  }

  getAllRoutes(): RouteDefinition[] {
    return this.enabledDefinitions(this.routes);
  }

  setTools(pluginName: string, defs: ToolDefinition[]): void {
    this.tools.set(pluginName, defs);
  }

  getAllTools(): ToolDefinition[] {
    return this.enabledDefinitions(this.tools);
  }

  setAgentRoles(pluginName: string, defs: AgentRoleDefinition[]): void {
    this.agentRoles.set(pluginName, defs);
  }

  getAllAgentRoles(): AgentRoleDefinition[] {
    return this.enabledDefinitions(this.agentRoles);
  }

  setUIComponents(pluginName: string, defs: UIComponentDefinition[]): void {
    this.uiComponents.set(pluginName, defs);
  }

  getAllUIComponents(): UIComponentDefinition[] {
    return this.enabledDefinitions(this.uiComponents);
  }

  setEventHandlers(pluginName: string, defs: EventHandlerDefinition[]): void {
    this.eventHandlers.set(pluginName, defs);
  }

  getAllEventHandlers(): EventHandlerDefinition[] {
    return this.enabledDefinitions(this.eventHandlers);
  }

  setMigrations(pluginName: string, defs: MigrationDefinition[]): void {
    this.migrations.set(pluginName, defs);
  }

  getAllMigrations(): MigrationDefinition[] {
    return this.enabledDefinitions(this.migrations);
  }

  clear(): void {
    this.routes.clear();
    this.tools.clear();
    this.agentRoles.clear();
    this.uiComponents.clear();
    this.eventHandlers.clear();
    this.migrations.clear();
    this.enabledMap.clear();
  }

  private enabledDefinitions<T>(definitions: Map<string, T[]>): T[] {
    const out: T[] = [];
    for (const [name, defs] of definitions) {
      if (!this.isEnabled(name)) continue;
      out.push(...defs);
    }
    return out;
  }
}
