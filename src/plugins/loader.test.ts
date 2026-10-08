// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin loader lifecycle — temp-dir fixtures with a stubbed plugin_state.
 *
 * loadSinglePlugin is driven directly against plugin dirs created under
 * os.tmpdir() (never the repo tree). loadAllPlugins runs against the real
 * shipped plugin directories with only the DB layer stubbed. The
 * origin-scoped-approval block at the end is the exception: it runs against
 * a real in-memory schema so the persisted `plugin_state` row is the thing
 * under assertion, not a stub echo.
 * @module plugin-loader-test
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import type { Logger, } from "../logger";
import { createLogger, getLogger, setGlobalLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";
import { writeMemoryNoteTool, } from "../generation/tools/write-memory-note";
import { createTestDb, } from "../test-utils/create-test-db";
import { dispatchPluginRoute, loadAllPlugins, loadSinglePlugin, registry, unloadAllPlugins, } from "./loader";

// ── Fixture sources (written to temp dirs, imported by the loader) ──

const STATIC_PLUGIN = `export const plugin = {
  name: "fixture-static",
  version: "1.0.0",
  description: "static fixture",
  author: "test",
  apiRoutes: [{ method: "GET", path: "/fixture-static", handler: async () => new Response("static"), },],
  tools: [{ name: "fixture-static-tool", description: "s", parameters: {}, handler: async () => ({ content: "static", }), },],
  agentRoles: [{ id: "fixture-static-role", name: "Static", description: "s", systemPrompt: "p", tools: [], },],
  uiComponents: [{ type: "web", name: "fixture-static-ui", location: "test.panel", },],
  eventHandlers: [{ event: "fixture.static", handler: async () => {}, },],
  migrations: [{ version: 1, name: "fixture-static-migration", up: async () => {}, },],
};
`;

const FULL_PLUGIN = `export const plugin = {
  name: "fixture-full",
  version: "1.0.0",
  description: "full fixture",
  author: "test",
  tools: [{ name: "fixture-full-static-tool", description: "s", parameters: {}, handler: async () => ({ content: "static", }), },],
  config: { mode: "test" },
  async onLoad(ctx) {
    ctx.logger.info("loading", { step: 1, });
    ctx.logger.warn("careful");
    ctx.logger.error("bad");
    ctx.logger.debug("detail");
    ctx.registerTool({ name: "fixture-full-tool", description: "d", parameters: {}, handler: async () => ({ content: "dyn", }), });
    ctx.registerAgentRole({ id: "fixture-full-role", name: "Dyn", description: "d", systemPrompt: "p", tools: [], });
    ctx.registerApiRoute({ method: "GET", path: "/fixture-full", handler: async () => new Response("dyn"), });
    ctx.registerUiComponent({ type: "web", name: "fixture-full-ui", location: "test.panel", });
    ctx.registerEventHandler({ event: "fixture.full", handler: async () => {}, });
    globalThis.__llFixtureCtx = ctx;
  },
};
`;

/**
 * @param version
 */
function dupPlugin(version: string,): string {
  return `export const plugin = {
  name: "fixture-dup",
  version: "${version}",
  description: "duplicate fixture",
  author: "test",
};
`;
}

/**
 * @param name
 * @param token
 */
function unloadPlugin(name: string, token: string,): string {
  return `export const plugin = {
  name: "${name}",
  version: "1.0.0",
  description: "unload fixture",
  author: "test",
  async onUnload() {
    (globalThis.__llUnloadOrder ??= []).push("${token}");
  },
};
`;
}

const THROWING_ONLOAD_PLUGIN = `export const plugin = {
  name: "fixture-onload-boom",
  version: "1.0.0",
  description: "throwing onLoad fixture",
  author: "test",
  apiRoutes: [{ method: "GET", path: "/fixture-onload-boom", handler: async () => new Response("nope"), },],
  tools: [{ name: "fixture-onload-boom-tool", description: "s", parameters: {}, handler: async () => ({ content: "x", }), },],
  agentRoles: [{ id: "fixture-onload-boom-role", name: "Boom", description: "s", systemPrompt: "p", tools: [], },],
  uiComponents: [{ type: "web", name: "fixture-onload-boom-ui", location: "test.panel", },],
  eventHandlers: [{ event: "fixture.onload.boom", handler: async () => {}, },],
  migrations: [{ version: 1, name: "fixture-onload-boom-migration", up: async () => {}, },],
  async onLoad(ctx) {
    ctx.registerTool({ name: "fixture-onload-boom-dyn-tool", description: "d", parameters: {}, handler: async () => ({ content: "x", }), });
    ctx.registerEventHandler({ event: "fixture.onload.dyn", handler: async () => {}, });
    throw new Error("hook failed");
  },
  async onUnload() {
    globalThis.__llUnloadCount = (globalThis.__llUnloadCount ?? 0) + 1;
  },
};
`;

const THROWING_UNLOAD_PLUGIN = `export const plugin = {
  name: "fixture-unload-boom",
  version: "1.0.0",
  description: "throwing onUnload fixture",
  author: "test",
  async onUnload() { throw new Error("shutdown boom"); },
};
`;

// ── Helpers ────────────────────────────────────────────────────

/** Temp dirs created this test — removed in afterEach. */
let tempDirs: string[] = [];

/**
 * Create an isolated plugin dir under os.tmpdir() with the given files.
 * @param files
 */
function makePluginDir(files: Record<string, string>,): string {
  const dir = mkdtempSync(join(tmpdir(), "loop-lore-plugin-",),);
  tempDirs.push(dir,);
  for (const [name, content] of Object.entries(files,)) {
    writeFileSync(join(dir, name,), content,);
  }

  return dir;
}

interface StubDbOptions {
  states?: Array<{ name: string; status: string }>;
  statesError?: unknown;
  /** Pre-existing approval row returned by the per-plugin status read. */
  stateRow?: { status: string } | undefined;
  inserts?: Array<Record<string, unknown>>;
  conflictCols?: string[];
  insertThrows?: boolean;
  configRow?: { config_json: string | null } | undefined;
  configError?: unknown;
}

/**
 * Minimal Kysely stand-in covering only the plugin_state queries the
 * loader issues (select states, insert-or-ignore a state row).
 * @param options
 */
function stubDb(options: StubDbOptions = {},): Kysely<DB> {
  return {
    selectFrom: () => ({
      selectAll: () => ({
        execute: async () => {
          if (options.statesError !== undefined) { throw options.statesError; }
          return options.states ?? [];
        },
      }),
      select: (cols?: string[],) => ({
        where: () => ({
          executeTakeFirst: async () => {
            // Two single-row reads hit this chain: the plugin_state status
            // read (approval) and the stored-config read.
            if (cols?.includes("status",)) { return options.stateRow; }
            if (options.configError !== undefined) { throw options.configError; }
            return options.configRow;
          },
        }),
      }),
    }),
    insertInto: () => ({
      values: (row: Record<string, unknown>,) => {
        options.inserts?.push(row,);
        return {
          onConflict: (pick: (oc: unknown,) => unknown,) => {
            pick({
              column: (col: string,) => {
                options.conflictCols?.push(col,);
                return { doNothing: () => "do-nothing", };
              },
            },);

            return {
              execute: async () => {
                if (options.insertThrows) { throw new Error("db unavailable",); }
              },
            };
          },
        };
      },
    }),
  } as unknown as Kysely<DB>;
}

/**
 * Null logger — keeps loader chatter out of test output.
 *
 * Every `Logger` method must be present: `child()` hands this same object
 * to any caller, so a missing method (`trace`, `fatal`) turns a partial
 * stub into a landmine for every test file that runs later in the process
 * and resolves `getLogger().child(...)`.
 */
const nullLogger: Logger = {
  trace: () => {},
  fatal: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => nullLogger,
  addTransport: () => {},
  setBindings: () => {},
  setLevel: () => {},
  flush: () => Promise.resolve(),
};

/**
 */
function globals(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

/** The logger in place before this suite replaced it, if any. */
let priorLogger: Logger | null = null;
let capturedPrior = false;

beforeEach(() => {
  registry.unregisterAll();
  if (!capturedPrior) {
    capturedPrior = true;
    // Throws when nothing initialized a logger yet — that is a valid state.
    try {
      priorLogger = getLogger();
    } catch {
      priorLogger = null;
    }
  }

  setGlobalLogger(nullLogger,);
});

afterEach(async () => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true, },);
  }

  tempDirs = [];
  for (const key of ["__llFixtureCtx", "__llUnloadOrder", "__llUnloadCount",]) {
    delete globals()[key];
  }

  await unloadAllPlugins();
  // Restore a real logger: leaving `nullLogger` installed makes every later
  // test file in this process inherit a stub instead of the real one.
  setGlobalLogger(priorLogger ?? createLogger({ level: "error", },),);
});

// ── loadSinglePlugin ───────────────────────────────────────────

describe("loadSinglePlugin", () => {
  test("loads a static-manifest plugin and persists an origin-scoped state", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const dir = makePluginDir({ "plugin.ts": STATIC_PLUGIN, });

    // `stateRow` stands in for an admin having already approved this name, so
    // the definitions asserted below are the enabled ones.
    await loadSinglePlugin(stubDb({ inserts, stateRow: { status: "active", }, }), "fixture-static", dir, "local",);

    const loaded = registry.getPlugin("fixture-static");
    expect(loaded?.origin,).toBe("local",);
    expect(loaded?.directory,).toBe(dir,);
    expect(registry.getAllTools().map((t,) => t.name,),).toContain("fixture-static-tool",);
    expect(registry.getAllAgentRoles().map((r,) => r.id,),).toContain("fixture-static-role",);
    expect(registry.getAllRoutes().map((r,) => r.path,),).toContain("/fixture-static",);
    expect(registry.getAllUIComponents().map((c,) => c.name,),).toContain("fixture-static-ui",);
    expect(registry.getAllEventHandlers(),).toHaveLength(1,);
    expect(registry.getAllMigrations().map((m,) => m.name,),).toContain("fixture-static-migration",);
    expect(inserts,).toHaveLength(1,);
    // A `local` origin is never self-approved: the row lands disabled.
    expect(inserts[0],).toMatchObject({ name: "fixture-static", status: "disabled", enabled_at: null, });
  });

  test("runs onLoad with a wired context and a namespaced logger", async () => {
    const seen: Array<{ level: string; entry: unknown }> = [];
    const capture = (level: string,) => (entry: unknown,) => {
      seen.push({ level, entry, },);
    };

    setGlobalLogger({
      ...nullLogger,
      info: capture("info",),
      warn: capture("warn",),
      error: capture("error",),
      debug: capture("debug",),
    },);

    const db = stubDb({ stateRow: { status: "active", }, });
    const dir = makePluginDir({ "plugin.ts": FULL_PLUGIN, });

    await loadSinglePlugin(db, "fixture-full", dir, "community",);

    expect(registry.getAllTools().map((t,) => t.name,),).toContain("fixture-full-tool",);
    expect(registry.getAllAgentRoles().map((r,) => r.id,),).toContain("fixture-full-role",);
    expect(registry.getAllRoutes().map((r,) => r.path,),).toContain("/fixture-full",);
    expect(registry.getAllUIComponents().map((c,) => c.name,),).toContain("fixture-full-ui",);
    expect(registry.getAllEventHandlers(),).toHaveLength(1,);
    // Each hook-emitted log is captured and namespaced to the manifest name.
    const hookLogs = seen.filter((s,) =>
      (s.entry as { message?: string })?.message === "loading"
      || (s.entry as { message?: string })?.message === "careful"
      || (s.entry as { message?: string })?.message === "bad"
      || (s.entry as { message?: string })?.message === "detail"
    );

    expect(hookLogs.map((s,) => s.level,),).toEqual(["info", "warn", "error", "debug",]);
    for (const { entry, } of hookLogs) {
      expect(entry,).toMatchObject({ plugin: "fixture-full", });
    }

    expect(hookLogs[0]?.entry,).toMatchObject({ message: "loading", step: 1, });
    // The hook received the live db handle (own fixture shape, so a named cast is enough).
    const fixtureCtx = globals().__llFixtureCtx as { db: unknown; config: Record<string, unknown> };
    expect(fixtureCtx.db,).toBe(db,);
    expect(fixtureCtx.config,).toEqual({ mode: "test" });
  });

  test("rejects a manifest without a name", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const dir = makePluginDir({ "plugin.ts": `export const plugin = { version: "1.0.0", };\n`, });

    await loadSinglePlugin(stubDb({ inserts, }), "nameless", dir, "local",);

    expect(registry.getPlugin("nameless"),).toBeUndefined();
    expect(registry.listPlugins(),).toEqual([],);
    expect(inserts,).toEqual([],);
  });

  test("rejects a module without a plugin export", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const dir = makePluginDir({ "plugin.ts": `export const nothing = 1;\n`, });

    await loadSinglePlugin(stubDb({ inserts, }), "exportless", dir, "local",);

    expect(registry.getPlugin("exportless"),).toBeUndefined();
    expect(registry.listPlugins(),).toEqual([],);
    expect(inserts,).toEqual([],);
  });

  test("ignores directories without plugin.ts", async () => {
    const dir = makePluginDir({});

    await loadSinglePlugin(stubDb(), "ghost", dir, "local",);

    expect(registry.listPlugins(),).toEqual([],);
  });

  test("swallows import failures without registering", async () => {
    const dir = makePluginDir({ "plugin.ts": `throw new Error("boom");\n`, });

    await loadSinglePlugin(stubDb(), "broken", dir, "local",);

    expect(registry.listPlugins(),).toEqual([],);
  });

  test("rolls back every registration when onLoad throws", async () => {
    const dir = makePluginDir({ "plugin.ts": THROWING_ONLOAD_PLUGIN, });

    await loadSinglePlugin(stubDb({ stateRow: { status: "active", }, }), "fixture-onload-boom", dir, "local",);

    // The plugin is gone from the registry and unreachable for shutdown.
    expect(registry.getPlugin("fixture-onload-boom"),).toBeUndefined();
    expect(registry.listPluginStates().map((s,) => s.name,),).not.toContain("fixture-onload-boom",);
    expect(registry.isEnabled("fixture-onload-boom"),).toBe(false,);

    // Manifest extensions AND anything registered from onLoad before the throw.
    expect(registry.getAllRoutes(),).toEqual([],);
    expect(registry.getAllTools(),).toEqual([],);
    expect(registry.getAllAgentRoles(),).toEqual([],);
    expect(registry.getAllUIComponents(),).toEqual([],);
    expect(registry.getAllEventHandlers(),).toEqual([],);
    expect(registry.getAllMigrations(),).toEqual([],);
    expect(registry.getPluginRoutes("fixture-onload-boom"),).toEqual([],);
    expect(
      await dispatchPluginRoute({ request: new Request("http://x/fixture-onload-boom"), },),
    ).toBeNull();

    await unloadAllPlugins();
    // onUnload is never called: the plugin never finished loading.
    expect(globals().__llUnloadCount,).toBeUndefined();
    expect(registry.listPlugins(),).toEqual([],);
  });

  test("reloading a name overwrites the registration and persists idempotently", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const conflictCols: string[] = [];
    const db = stubDb({ inserts, conflictCols, });
    const dirA = makePluginDir({ "plugin.ts": dupPlugin("1.0.0",), });
    const dirB = makePluginDir({ "plugin.ts": dupPlugin("2.0.0",), });

    await loadSinglePlugin(db, "fixture-dup", dirA, "local",);
    await loadSinglePlugin(db, "fixture-dup", dirB, "community",);

    expect(
      registry.listPlugins().filter((p,) => p.manifest.name === "fixture-dup",),
    ).toHaveLength(1,);

    expect(registry.getPlugin("fixture-dup")?.manifest.version,).toBe("2.0.0",);
    expect(inserts,).toHaveLength(2,);
    // Both persists target the name column with do-nothing on conflict.
    expect(conflictCols,).toEqual(["name", "name",]);
  });

  test("treats plugin_state persistence as best-effort", async () => {
    const dir = makePluginDir({ "plugin.ts": STATIC_PLUGIN, });

    await loadSinglePlugin(stubDb({ insertThrows: true, }), "fixture-static", dir, "local",);

    expect(registry.getPlugin("fixture-static"),).toBeDefined();
  });

  test("merges a stored config override over manifest defaults into onLoad ctx.config", async () => {
    const db = stubDb({ configRow: { config_json: jsonStringifyOr({ mode: "stored", },), }, });
    const dir = makePluginDir({ "plugin.ts": FULL_PLUGIN, });

    await loadSinglePlugin(db, "fixture-full", dir, "community",);

    const fixtureCtx = globals().__llFixtureCtx as { config: Record<string, unknown> };
    expect(fixtureCtx.config,).toEqual({ mode: "stored" });
  });

  test("falls back to manifest defaults and warns when stored config_json is malformed", async () => {
    const warns: unknown[] = [];
    setGlobalLogger({
      ...nullLogger,
      warn: (entry: unknown,) => { warns.push(entry,); },
    },);

    const db = stubDb({ configRow: { config_json: "{ not json", }, });
    const dir = makePluginDir({ "plugin.ts": FULL_PLUGIN, });

    await loadSinglePlugin(db, "fixture-full", dir, "community",);

    const fixtureCtx = globals().__llFixtureCtx as { config: Record<string, unknown> };
    expect(fixtureCtx.config,).toEqual({ mode: "test" });
    expect(
      warns.some((w,) => (w as { message?: string }).message?.includes("Failed to read stored plugin config",)),
    ).toBe(true,);
  });
});

// ── unloadAllPlugins ───────────────────────────────────────────

describe("unloadAllPlugins via single loads", () => {
  test("calls onUnload in reverse load order and clears the registry", async () => {
    globals().__llUnloadOrder = [] as string[];
    const dirA = makePluginDir({ "plugin.ts": unloadPlugin("order-a", "a",), });
    const dirB = makePluginDir({ "plugin.ts": unloadPlugin("order-b", "b",), });

    await loadSinglePlugin(stubDb(), "order-a", dirA, "core",);
    await loadSinglePlugin(stubDb(), "order-b", dirB, "core",);
    await unloadAllPlugins();

    expect(globals().__llUnloadOrder,).toEqual(["b", "a",]);
    expect(registry.listPlugins(),).toEqual([],);
  });

  test("swallows a throwing onUnload and still clears", async () => {
    const dir = makePluginDir({ "plugin.ts": THROWING_UNLOAD_PLUGIN, });

    await loadSinglePlugin(stubDb(), "fixture-unload-boom", dir, "core",);
    expect(unloadAllPlugins(),).resolves.toBeUndefined();

    expect(registry.listPlugins(),).toEqual([],);
  });
});

// ── dispatchPluginRoute ────────────────────────────────────────

describe("dispatchPluginRoute", () => {
  test("matches a registered enabled route by path + method", async () => {
    const dir = makePluginDir({
      "plugin.ts": `export const plugin = {
        name: "fixture-dispatch",
        version: "1.0.0",
        description: "d",
        author: "t",
        apiRoutes: [{
          method: "GET",
          path: "/fixture-dispatch/ping",
          handler: async () => new Response("pong"),
        },],
      };\n`,
    });

    await loadSinglePlugin(stubDb({ stateRow: { status: "active", }, }), "fixture-dispatch", dir, "local");

    const res = await dispatchPluginRoute({
      request: new Request("http://x/fixture-dispatch/ping", { method: "GET" }),
    });

    expect(res).not.toBeNull();
    expect(await res!.text()).toBe("pong");
  });

  test("returns null when path does not match", async () => {
    const dir = makePluginDir({
      "plugin.ts": `export const plugin = {
        name: "fixture-dispatch-miss",
        version: "1.0.0",
        description: "d",
        author: "t",
        apiRoutes: [{
          method: "GET",
          path: "/a",
          handler: async () => new Response("ok"),
        },],
      };\n`,
    });

    await loadSinglePlugin(stubDb({ stateRow: { status: "active", }, }), "fixture-dispatch-miss", dir, "local");

    const res = await dispatchPluginRoute({
      request: new Request("http://x/b", { method: "GET" }),
    });

    expect(res).toBeNull();
  });

  test("returns null when method does not match", async () => {
    const dir = makePluginDir({
      "plugin.ts": `export const plugin = {
        name: "fixture-dispatch-method",
        version: "1.0.0",
        description: "d",
        author: "t",
        apiRoutes: [{
          method: "GET",
          path: "/a",
          handler: async () => new Response("ok"),
        },],
      };\n`,
    });

    await loadSinglePlugin(stubDb({ stateRow: { status: "active", }, }), "fixture-dispatch-method", dir, "local");

    const res = await dispatchPluginRoute({
      request: new Request("http://x/a", { method: "POST" }),
    });

    expect(res).toBeNull();
  });

  test("skips disabled plugins", async () => {
    const dir = makePluginDir({
      "plugin.ts": `export const plugin = {
        name: "fixture-dispatch-off",
        version: "1.0.0",
        description: "d",
        author: "t",
        apiRoutes: [{
          method: "GET",
          path: "/off",
          handler: async () => new Response("ok"),
        },],
      };\n`,
    });

    await loadSinglePlugin(stubDb({ stateRow: { status: "active", }, }), "fixture-dispatch-off", dir, "local");
    registry.setEnabled("fixture-dispatch-off", false);

    const res = await dispatchPluginRoute({
      request: new Request("http://x/off", { method: "GET" }),
    });

    expect(res).toBeNull();
  });
});

// ── loadAllPlugins ─────────────────────────────────────────────

describe("loadAllPlugins", () => {
  test("applies persisted states and registers shipped plugins plus builtin tools", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const db = stubDb({
      states: [
        { name: "ghost-plugin", status: "disabled", },
        { name: "ghost-active", status: "active", },
      ],
      inserts,
    },);

    await loadAllPlugins(db,);

    expect(registry.isEnabled("ghost-plugin"),).toBe(false,);
    expect(registry.isEnabled("ghost-active"),).toBe(true,);
    // Real directory scan: the shipped dice-roller sample loads from plugins/core.
    expect(registry.getPlugin("dice-roller")?.origin,).toBe("core",);
    // Builtin core tools register on every boot.
    expect(registry.getAllTools(),).toContain(writeMemoryNoteTool,);
    // Each loaded plugin persisted a row scoped to its origin.
    expect(inserts.length,).toBeGreaterThan(0,);
    for (const row of inserts) {
      const origin = registry.getPlugin(String(row.name,))?.origin;
      expect(row,).toMatchObject({ status: origin === "core" ? "active" : "disabled", });
    }

    // Real directory scan: the shipped community plugins are registered but
    // not approved, so their definitions are filtered out.
    expect(registry.isEnabled("trivia"),).toBe(false,);
    expect(registry.getPluginRoutes("trivia").length,).toBeGreaterThan(0,);
    expect(registry.getEnabledRoutes().map((r,) => r.path,),).not.toContain("/api/trivia/start",);
  });

  test("boots when plugin_state is missing and skips absent plugin dirs", async () => {
    const db = stubDb({ statesError: new Error("no such table: plugin_state",), });

    await loadAllPlugins(db,);

    // plugins/local does not ship, core/community do — boot still succeeds.
    expect(registry.listPlugins().length,).toBeGreaterThan(0,);
    expect(registry.getAllTools(),).toContain(writeMemoryNoteTool,);
  });
});

// ── Origin-scoped approval (real plugin_state table) ────────────

/**
 * A plugin dir whose only extension point is a single answering route.
 * @param name
 * @param path
 * @param body
 */
function routeOnlyPlugin(name: string, path: string, body: string,): string {
  return `export const plugin = {
  name: "${name}",
  version: "1.0.0",
  description: "approval fixture",
  author: "test",
  apiRoutes: [{ method: "GET", path: "${path}", handler: async () => new Response("${body}"), },],
};
`;
}

describe("origin-scoped approval", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = (await createTestDb()).db;
  });

  /**
   * @param name
   */
  async function persistedStatus(name: string,): Promise<string | undefined> {
    const row = await db
      .selectFrom("plugin_state",)
      .select("status",)
      .where("name", "=", name,)
      .executeTakeFirst();

    return row?.status;
  }

  test("a community plugin with no plugin_state row lands non-active and does not dispatch", async () => {
    const dir = makePluginDir({ "plugin.ts": routeOnlyPlugin("fixture-approval-community", "/approval/community", "community",), });

    await loadSinglePlugin(db, "fixture-approval-community", dir, "community",);

    expect(await persistedStatus("fixture-approval-community",),).toBe("disabled",);
    expect(registry.isEnabled("fixture-approval-community",),).toBe(false,);
    expect(
      await dispatchPluginRoute({ request: new Request("http://x/approval/community",), },),
    ).toBeNull();

    // Still registered, so the admin enable path is all it takes to serve it.
    expect(registry.getPluginRoutes("fixture-approval-community"),).toHaveLength(1,);
    registry.setEnabled("fixture-approval-community", true,);
    const res = await dispatchPluginRoute({ request: new Request("http://x/approval/community",), },);
    expect(await res?.text(),).toBe("community",);
  });

  test("a core plugin self-approves and dispatches", async () => {
    const dir = makePluginDir({ "plugin.ts": routeOnlyPlugin("fixture-approval-core", "/approval/core", "core",), });

    await loadSinglePlugin(db, "fixture-approval-core", dir, "core",);

    expect(await persistedStatus("fixture-approval-core",),).toBe("active",);
    expect(registry.isEnabled("fixture-approval-core",),).toBe(true,);
    const res = await dispatchPluginRoute({ request: new Request("http://x/approval/core",), },);
    expect(await res?.text(),).toBe("core",);
  });

  test("an existing row decides regardless of origin", async () => {
    await db
      .insertInto("plugin_state",)
      .values({ name: "fixture-approval-vetoed", status: "disabled", },)
      .execute();

    const dir = makePluginDir({ "plugin.ts": routeOnlyPlugin("fixture-approval-vetoed", "/approval/vetoed", "vetoed",), });

    await loadSinglePlugin(db, "fixture-approval-vetoed", dir, "core",);

    expect(await persistedStatus("fixture-approval-vetoed",),).toBe("disabled",);
    expect(registry.isEnabled("fixture-approval-vetoed",),).toBe(false,);
    expect(
      await dispatchPluginRoute({ request: new Request("http://x/approval/vetoed",), },),
    ).toBeNull();
  });
});
