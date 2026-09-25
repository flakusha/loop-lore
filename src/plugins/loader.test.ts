// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin loader lifecycle — temp-dir fixtures with a stubbed plugin_state.
 *
 * loadSinglePlugin is driven directly against plugin dirs created under
 * os.tmpdir() (never the repo tree). loadAllPlugins runs against the real
 * shipped plugin directories with only the DB layer stubbed.
 * @module plugin-loader-test
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import type { Logger, } from "../logger";
import { setGlobalLogger, } from "../logger";
import { writeMemoryNoteTool, } from "../generation/tools/write-memory-note";
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
  async onLoad() { throw new Error("hook failed"); },
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
  inserts?: Array<Record<string, unknown>>;
  conflictCols?: string[];
  insertThrows?: boolean;
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

/** Null logger — keeps loader chatter out of test output. */
const nullLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => nullLogger,
} as unknown as Logger;

/**
 */
function globals(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

beforeEach(() => {
  registry.unregisterAll();
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
});

// ── loadSinglePlugin ───────────────────────────────────────────

describe("loadSinglePlugin", () => {
  test("loads a static-manifest plugin and persists active state", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const dir = makePluginDir({ "plugin.ts": STATIC_PLUGIN, });

    await loadSinglePlugin(stubDb({ inserts, }), "fixture-static", dir, "local",);

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
    expect(inserts[0],).toMatchObject({ name: "fixture-static", status: "active", });
  });

  test("runs onLoad with a wired context and a namespaced logger", async () => {
    const seen: Array<{ level: string; entry: unknown }> = [];
    const capture = (level: string,) => (entry: unknown,) => {
      seen.push({ level, entry, },);
    };
    setGlobalLogger({
      info: capture("info",),
      warn: capture("warn",),
      error: capture("error",),
      debug: capture("debug",),
      child: () => nullLogger,
    } as unknown as Logger,);
    const db = stubDb();
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

  test("a throwing onLoad still registers but never queues for unload", async () => {
    const dir = makePluginDir({ "plugin.ts": THROWING_ONLOAD_PLUGIN, });

    await loadSinglePlugin(stubDb(), "fixture-onload-boom", dir, "local",);

    // Registration happens before the hook runs.
    expect(registry.getPlugin("fixture-onload-boom"),).toBeDefined();
    await unloadAllPlugins();
    // The failed load never reached the load-order push, so onUnload is skipped.
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
    await loadSinglePlugin(stubDb(), "fixture-dispatch", dir, "local");

    const res = await dispatchPluginRoute(
      new Request("http://x/fixture-dispatch/ping", { method: "GET" }),
    );
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
    await loadSinglePlugin(stubDb(), "fixture-dispatch-miss", dir, "local");

    const res = await dispatchPluginRoute(
      new Request("http://x/b", { method: "GET" }),
    );
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
    await loadSinglePlugin(stubDb(), "fixture-dispatch-method", dir, "local");

    const res = await dispatchPluginRoute(
      new Request("http://x/a", { method: "POST" }),
    );
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
    await loadSinglePlugin(stubDb(), "fixture-dispatch-off", dir, "local");
    registry.setEnabled("fixture-dispatch-off", false);

    const res = await dispatchPluginRoute(
      new Request("http://x/off", { method: "GET" }),
    );
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
    // Each loaded plugin persisted an active row.
    expect(inserts.length,).toBeGreaterThan(0,);
    for (const row of inserts) {
      expect(row,).toMatchObject({ status: "active", });
    }
  });

  test("boots when plugin_state is missing and skips absent plugin dirs", async () => {
    const db = stubDb({ statesError: new Error("no such table: plugin_state",), });

    await loadAllPlugins(db,);

    // plugins/local does not ship, core/community do — boot still succeeds.
    expect(registry.listPlugins().length,).toBeGreaterThan(0,);
    expect(registry.getAllTools(),).toContain(writeMemoryNoteTool,);
  });
});
