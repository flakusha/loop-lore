// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 290
// Cohesive loader module: scan, single load + rollback, approval state,
// dispatch, shutdown.

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
import { PluginStatus } from "../db/enums";
import type { DB, PluginState } from "../db/schema";
import type { PluginLogger, PluginManifest, PluginOrigin } from "./types";
import { registry } from "./registry";
import { mergePluginConfig } from "./config-merge";
import { readStoredPluginConfig } from "./config-store";
import { checkRouteAccess, type PluginCaller, } from "./route-access";
import { warnIfAccessFieldsAreInert, type LoadAllPluginsOpts, } from "./solo-mode-warning";
import type { TranslatorFn, } from "../i18n/types";
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
 * @param opts - load options (see {@link LoadAllPluginsOpts})
 * @returns Nothing.
 */
export async function loadAllPlugins(
  db: Kysely<DB>,
  opts: LoadAllPluginsOpts = {},
): Promise<void> {
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
    registry.setEnabled(row.name, row.status === PluginStatus.Active,);
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

  // Routes are only registered by now, so this is the earliest point at which
  // the declared-but-unenforceable set is known.
  warnIfAccessFieldsAreInert(opts,);
}

/**
 * Load a single plugin from its directory: manifest, hooks, and state.
 * Exported for tests, which drive it with temp-dir fixtures.
 * @param db
 * @param pluginName
 * @param pluginDir
 * @param origin
 * @returns Nothing.
 */
export async function loadSinglePlugin(
  db: Kysely<DB>,
  pluginName: string,
  pluginDir: string,
  origin: PluginOrigin,
): Promise<void> {
  const log = getLogger();
  const pluginFile = join(pluginDir, "plugin.ts");
  if (!existsSync(pluginFile)) { return; }

  // Held outside the try so the catch can roll back a partial registration.
  let registeredName: string | undefined;

  try {
    const mod = (await import(/* @vite-ignore */ pluginFile)) as Record<string, unknown>;
    const manifest = mod.plugin as PluginManifest | undefined;
    if (!manifest?.name) {
      log.warn({ message: `Invalid plugin manifest`, pluginName });
      return;
    }

    registeredName = manifest.name;
    registry.register({ manifest, origin, directory: pluginDir, });
    // Approval is origin-scoped: a community/local plugin only runs once
    // plugin_state says so (see persistPluginState / isPluginActive).
    registry.setEnabled(manifest.name, await isPluginActive({ db, name: manifest.name, origin, },),);
    registerManifestExtensions(manifest,);

    // FEAT-051: merge any admin-stored config over manifest defaults so the
    // hook (and required-key enforcement) sees the effective config.
    const storedConfig = await readStoredPluginConfig(db, manifest.name,);

    // Call onLoad hook — allows dynamic registration
    if (typeof manifest.onLoad === "function") {
      await manifest.onLoad({
        db,
        config: mergePluginConfig(manifest.config ?? {}, storedConfig, manifest.configSchema),
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
    await persistPluginState({ db, name: manifest.name, origin, },);
  } catch (error) {
    // RegistryStore keys every definition Map by plugin name, so removing the
    // plugin also drops both the manifest extensions and anything `onLoad`
    // registered before it threw. `onUnload` is deliberately NOT called: the
    // plugin never finished loading, so its teardown state is undefined.
    if (registeredName) { registry.unregister(registeredName); }

    log.error({ message: `Failed to load plugin`, plugin: pluginName, error: String(error,), });
  }
}

/**
 * Register static extension points declared in a plugin manifest.
 * @param manifest
 * @throws When the plugin origin cannot register a declared extension point.
 */
function registerManifestExtensions(manifest: PluginManifest,): void {
  if (manifest.migrations?.length) { registry.addMigrations(manifest.name, manifest.migrations,); }
  if (manifest.apiRoutes?.length) { registry.addRoutes(manifest.name, manifest.apiRoutes,); }
  if (manifest.tools?.length) { registry.addTools(manifest.name, manifest.tools,); }
  if (manifest.agentRoles?.length) { registry.addAgentRoles(manifest.name, manifest.agentRoles,); }
  if (manifest.uiComponents?.length) { registry.addUIComponents(manifest.name, manifest.uiComponents,); }
  if (manifest.eventHandlers?.length) { registry.addEventHandlers(manifest.name, manifest.eventHandlers,); }
}

/** Inputs for the plugin_state approval read/write pair. */
interface PluginApprovalOpts {
  db: Kysely<DB>;
  name: string;
  origin: PluginOrigin;
}

/**
 * Persist a new plugin to plugin_state if not already tracked (best-effort).
 * Only `core` self-approves; community/local land disabled until an admin
 * enables them, so dropping a directory in can never activate a plugin.
 * @param opts
 */
async function persistPluginState({ db, name, origin, }: PluginApprovalOpts): Promise<void> {
  const selfApproved = origin === "core";
  const status = selfApproved ? PluginStatus.Active : PluginStatus.Disabled;
  try {
    await db
      .insertInto("plugin_state")
      .values({ name, status, enabled_at: selfApproved ? new Date().toISOString() : null, })
      .onConflict((oc) => oc.column("name").doNothing(),)
      .execute();
  } catch (error) {
    // Best-effort, but never silent: a caller that assumes the row landed
    // would otherwise run a plugin whose approval state it never learned.
    getLogger().error({ message: `Failed to persist plugin state`, plugin: name, error: String(error,), });
  }
}

/**
 * Whether a plugin may run. The persisted plugin_state row decides; a name
 * with no row falls back to origin, so only `core` self-approves on first sight.
 * @param opts
 */
async function isPluginActive({ db, name, origin, }: PluginApprovalOpts): Promise<boolean> {
  try {
    const row = await db
      .selectFrom("plugin_state")
      .select("status")
      .where("name", "=", name,)
      .executeTakeFirst();

    if (row) { return row.status === PluginStatus.Active; }
  } catch {
    // plugin_state may not exist on first boot — fall through to the origin default.
  }

  return origin === "core";
}

/** Options for {@link dispatchPluginRoute}. */
export interface DispatchPluginRouteOpts {
  request: Request;
  /** Identity resolved by the Elysia auth derive. Omitted → anonymous. */
  caller?: PluginCaller;
  /** Request-locale translator, so denial bodies are i18n'd like every other route. */
  t?: TranslatorFn;
}

/**
 * Dispatch a request against all registered plugin routes (enabled only).
 *
 * First match on path + method wins. A matched route declaring `requiresAuth`
 * or `permissions` that the caller does not satisfy short-circuits with a
 * 401/403 and its handler is never invoked. See `./route-access`.
 * @param opts - dispatch options
 * @param opts.request - incoming `Request` to match against registered routes
 * @param opts.caller - identity used to enforce `requiresAuth` / `permissions`
 * @param opts.t - translator used to localise the denial response
 * @returns {Promise<Response | null>}
*/
export async function dispatchPluginRoute(
  { request, caller, t, }: DispatchPluginRouteOpts,
): Promise<Response | null> {
  const url = new URL(request.url);
  for (const route of registry.getEnabledRoutes()) {
    if (url.pathname !== route.path || request.method !== route.method) { continue; }

    const denial = checkRouteAccess({ route, request, caller, t, },);
    if (denial) { return denial; }

    // `caller` is what lets a handler do row-level authorization; route-level
    // gating alone cannot tell it whose data it is allowed to touch.
    const result = await route.handler(request, caller);
    if (result) return result;
  }

  return null;
}

/**
 * Shutdown all plugins in reverse load order
 * @returns {Promise<void>}
 */
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
