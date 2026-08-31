// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin Loader — Scans plugin directories, loads manifests, calls lifecycle hooks
 *
 * Discovery order: core → community → local.
 * Shutdown: reverse order (local → community → core).
 * @module plugin-loader
 */

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Kysely, Selectable } from "kysely";
import type { DB, PluginState } from "../db/schema";
import type { PluginLogger, PluginManifest, PluginOrigin } from "./types";
import { registry } from "./registry";
import { getLogger } from "../logger";
import { writeMemoryNoteTool, } from "../generation/tools/write-memory-note";
import { characterCreationTool, } from "../generation/tools/create-character";
import { worldCreationTool, } from "../generation/tools/create-world";
import { locationCreationTool, } from "../generation/tools/create-location";
import { itemCreationTool, } from "../generation/tools/create-item";

/** Ordered list of plugin names for shutdown (reverse) */
const loadOrder: string[] = [];

const PLUGIN_DIRS: { origin: PluginOrigin; dir: string }[] = [
  { origin: "core", dir: "plugins/core" },
  { origin: "community", dir: "plugins/community" },
  { origin: "local", dir: "plugins/local" },
];

/**
 *
 * @param pluginName
 */
function makeLogger(pluginName: string): PluginLogger {
  const log = getLogger();
  return {
    info: (msg, meta) => {
      log.info({ ...meta, plugin: pluginName, message: msg });
    },
    warn: (msg, meta) => {
      log.warn({ ...meta, plugin: pluginName, message: msg });
    },
    error: (msg, meta) => {
      log.error({ ...meta, plugin: pluginName, message: msg });
    },
    debug: (msg, meta) => {
      log.debug({ ...meta, plugin: pluginName, message: msg });
    },
  };
}

/**
 * Load all plugins from all 3 directories.
 * Call once at startup, after DB is ready.
 *
 * Checks plugin_state table for previously disabled plugins.
 * @param db
 */
export async function loadAllPlugins(db: Kysely<DB>): Promise<void> {
  const log = getLogger();
  loadOrder.length = 0;

  // Load persisted plugin states
  let rawStates: Selectable<PluginState>[] = [];
  try {
    rawStates = await db
      .selectFrom("plugin_state")
      .selectAll()
      .execute();
  } catch {
    // plugin_state may not exist yet on first boot — proceed with no states
  }

  for (const row of rawStates) {
    registry.setEnabled(row.name, row.status === "active");
  }

  for (const { origin, dir } of PLUGIN_DIRS) {
    const fullDir = join(import.meta.dir, "..", "..", dir);
    if (!existsSync(fullDir)) {
      log.debug({ message: `Plugin dir not found — skipping`, dir });
      continue;
    }

    const entries = readdirSync(fullDir, { withFileTypes: true });
    const pluginDirs: string[] = [];
    for (const e of entries) {
      if (e.isDirectory()) { pluginDirs.push(e.name); }
    }
    pluginDirs.sort((a, b) => a.localeCompare(b));

    for (const pluginName of pluginDirs) {
      await loadSinglePlugin(db, pluginName, join(fullDir, pluginName), origin,);
    }
  }

  // Register builtin core tools (model-visible, executed with per-request ctx).
  registry.addTools("core", [
    writeMemoryNoteTool,
    characterCreationTool,
    worldCreationTool,
    locationCreationTool,
    itemCreationTool,
  ],);
}

/**
 * Load a single plugin from its directory: manifest, hooks, and state.
 * @param db
 * @param pluginName
 * @param pluginDir
 * @param origin
 */
async function loadSinglePlugin(
  db: Kysely<DB>,
  pluginName: string,
  pluginDir: string,
  origin: PluginOrigin,
): Promise<void> {
  const log = getLogger();
  const pluginFile = join(pluginDir, "plugin.ts");
  if (!existsSync(pluginFile)) { return; }

  try {
    const mod = (await import(/* @vite-ignore */ pluginFile)) as Record<string, unknown>;
    const manifest = mod.plugin as PluginManifest | undefined;
    if (!manifest?.name) {
      log.warn({ message: `Invalid plugin manifest`, pluginName });
      return;
    }

    registry.register({ manifest, origin, directory: pluginDir, });
    registerManifestExtensions(manifest,);

    // Call onLoad hook — allows dynamic registration
    if (typeof manifest.onLoad === "function") {
      await manifest.onLoad({
        db,
        logger: makeLogger(manifest.name,),
        registerTool: (def) => { registry.addTools(manifest.name, [def,],); },
        registerAgentRole: (def) => { registry.addAgentRoles(manifest.name, [def,],); },
        registerApiRoute: (def) => { registry.addRoutes(manifest.name, [def,],); },
        registerUiComponent: (def) => { registry.addUIComponents(manifest.name, [def,],); },
        registerEventHandler: (def) => { registry.addEventHandlers(manifest.name, [def,],); },
      });
    }

    loadOrder.push(manifest.name);
    log.info({ message: `Loaded plugin`, plugin: manifest.name, origin });
    await persistPluginState(db, manifest.name,);
  } catch (error) {
    log.error({ message: `Failed to load plugin`, plugin: pluginName, error: String(error,), });
  }
}

/**
 * Register static extension points declared in a plugin manifest.
 * @param manifest
 */
function registerManifestExtensions(manifest: PluginManifest,): void {
  if (manifest.apiRoutes?.length) { registry.addRoutes(manifest.name, manifest.apiRoutes,); }
  if (manifest.tools?.length) { registry.addTools(manifest.name, manifest.tools,); }
  if (manifest.agentRoles?.length) { registry.addAgentRoles(manifest.name, manifest.agentRoles,); }
  if (manifest.uiComponents?.length) { registry.addUIComponents(manifest.name, manifest.uiComponents,); }
  if (manifest.eventHandlers?.length) { registry.addEventHandlers(manifest.name, manifest.eventHandlers,); }
  if (manifest.migrations?.length) { registry.addMigrations(manifest.name, manifest.migrations,); }
}

/**
 * Persist a new plugin to plugin_state if not already tracked (best-effort).
 * @param db
 * @param name
 */
async function persistPluginState(db: Kysely<DB>, name: string,): Promise<void> {
  try {
    await db
      .insertInto("plugin_state")
      .values({ name, status: "active", enabled_at: new Date().toISOString(), })
      .onConflict((oc) => oc.column("name").doNothing(),)
      .execute();
  } catch {
    // Persisting plugin state is best-effort
  }
}

/**
 * Dispatch a request against all registered plugin routes (enabled only)
 * @param request
 */
export async function dispatchPluginRoute(request: Request): Promise<Response | null> {
  for (const route of registry.getAllRoutes()) {
    const url = new URL(request.url);
    if (url.pathname === route.path && request.method === route.method) {
      const result = await route.handler(request);
      if (result) return result;
    }
  }
  return null;
}

/** Shutdown all plugins in reverse load order */
export async function unloadAllPlugins(): Promise<void> {
  for (const name of loadOrder.reverse()) {
    const plugin = registry.getPlugin(name);
    if (plugin?.manifest.onUnload) {
      try {
        await plugin.manifest.onUnload();
      } catch {
        // swallow — best-effort shutdown
      }
    }
  }
  registry.unregisterAll();
  loadOrder.length = 0;
}

/** List all loaded plugins (for registry API routes) */

export { registry } from "./registry";
