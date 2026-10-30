// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin Registry — Stores all plugin registrations for consumers.
 * Each extension point (routes, tools, agent roles, …) has a dedicated
 * collection keyed by plugin name; consumers reach them via public getters.
 * @module plugin-registry
 */

import { assertPluginCanRegister, assertPluginRoutePath, normalizePluginRoutePath } from "./registry-policy";
import { RegistryStore } from "./registry-store";
import type { RouteCandidate } from "./registry-store";
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
import { getChildLogger } from "../logger";

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
   * Register routes for a plugin. Paths are normalized (trailing slash
   * collapsed), `:param` paths are rejected, and a duplicate method+path
   * registration logs a loud warning instead of silently pinning dispatch to
   * whichever route was registered first
   * (BUG-fix-plugins-define-plugin-route-matching-semantics).
   * @param pluginName
   * @param defs
   * @throws When the plugin is unknown, cannot register routes, or a path carries a :param segment.
   */
  addRoutes(pluginName: string, defs: RouteDefinition[],): void {
    this.assertCanRegister(pluginName, "routes",);
    for (const def of defs) {
      assertPluginRoutePath(pluginName, def.path,);
    }

    this.warnDuplicateRoutes(pluginName, defs,);
    this.store.appendRoutes(
      pluginName,
      defs.map((def,) => ({ ...def, path: normalizePluginRoutePath(def.path,), })),
    );
  }

  /**
   * Log a warning for every incoming def that duplicates an already-registered
   * method+path (in any plugin, including earlier defs in the same batch).
   * Dispatch still resolves by registration order — the warning just makes the
   * shadowing visible instead of silent.
   * @param pluginName
   * @param defs
   */
  private warnDuplicateRoutes(pluginName: string, defs: RouteDefinition[],): void {
    if (defs.length === 0) { return; }

    const log = getChildLogger("plugin-registry",);
    if (!log) { return; }

    for (const def of defs) {
      const normalized = normalizePluginRoutePath(def.path,);
      const existing = this.store.findRoute(def.method, normalized,);
      if (existing) {
        log.warn(
          `Duplicate plugin route registration: ${def.method} ${normalized} is already registered` +
            ` (${pluginName}); the earlier registration wins dispatch`,
        );
      }
    }
  }

  /**
   * @param pluginName
   * @param defs
   * @throws When the plugin is unknown or cannot register tools.
   */
  addTools(pluginName: string, defs: ToolDefinition[]): void {
    this.assertCanRegister(pluginName, "tools");
    this.store.appendTools(pluginName, defs);
  }

  /**
   * @param pluginName
   * @param defs
   * @throws When the plugin is unknown or cannot register agent roles.
   */
  addAgentRoles(pluginName: string, defs: AgentRoleDefinition[]): void {
    this.assertCanRegister(pluginName, "agentRoles");
    this.store.appendAgentRoles(pluginName, defs);
  }

  /**
   * @param pluginName
   * @param defs
   * @throws When the plugin is unknown or cannot register UI components.
   */
  addUIComponents(pluginName: string, defs: UIComponentDefinition[]): void {
    this.assertCanRegister(pluginName, "uiComponents");
    this.store.appendUIComponents(pluginName, defs);
  }

  /**
   * @param pluginName
   * @param defs
   * @throws When the plugin is unknown or cannot register event handlers.
   */
  addEventHandlers(pluginName: string, defs: EventHandlerDefinition[]): void {
    this.assertCanRegister(pluginName, "eventHandlers");
    this.store.appendEventHandlers(pluginName, defs);
  }

  /**
   * @param pluginName
   * @param defs
   * @throws When the plugin is unknown or cannot register migrations.
   */
  addMigrations(pluginName: string, defs: MigrationDefinition[]): void {
    this.assertCanRegister(pluginName, "migrations");
    this.store.appendMigrations(pluginName, defs);
  }

  // ── Accessors ─────────────────────────────────────────────

  /**
   * The loaded plugin, if found.
   * @param name
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /** All loaded plugins. */
  listPlugins(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /**
   * Plugins matching the origin.
   * @param origin
   */
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

  /**
   * Registered route candidates for method + normalized path in registration
   * order (plugin-grouped), regardless of enabled state — dispatch filters by
   * enablement per candidate so runtime flips are honored
   * (first-enabled-wins).
   * @param method
   * @param normalizedPath - already run through normalizePluginRoutePath
   */
  getRouteCandidates(method: string, normalizedPath: string,): ReadonlyArray<RouteCandidate> {
    return this.store.getRouteCandidates(method, normalizedPath,);
  }

  /**
   * Raw routes for a plugin, including disabled registrations.
   * @param pluginName
   */
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

  /**
   * Look up an enabled plugin agent role by id.
   * @param id
   */
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

  /**
   * Drop a single plugin and every extension it registered, leaving the
   * other plugins untouched. Used to roll back a failed load.
   * @param name
   */
  unregister(name: string): void {
    this.plugins.delete(name);
    this.store.removePlugin(name);
  }

  unregisterAll(): void {
    this.plugins.clear();
    this.store.clear();
  }

  /**
   * Whether the plugin is enabled.
   * @param name
   */
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
