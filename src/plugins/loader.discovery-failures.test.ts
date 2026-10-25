// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression tests: plugin discovery failures are visible in the structured
 * log — a missing entry point, an invalid manifest, and a plugin that throws
 * while loading (with its stack preserved).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import type { LogEntry, Logger, } from "../logger";
import { createLogger, getLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { registry, } from "./registry";
import { loadSinglePlugin, } from "./loader";

const tempDirs: string[] = [];

/**
 * @param files
 * @returns the temp plugin directory
 */
function makePluginDir(files: Record<string, string>,): string {
  const dir = mkdtempSync(join(tmpdir(), "loop-lore-plugin-failure-",),);
  tempDirs.push(dir,);
  for (const [name, content] of Object.entries(files,)) {
    writeFileSync(join(dir, name,), content,);
  }

  return dir;
}

describe("plugin discovery failures are logged", () => {
  let db: Kysely<DB>;
  let root: Logger;
  const entries: LogEntry[] = [];

  beforeAll(async () => {
    try {
      root = getLogger();
    } catch {
      root = createLogger({ level: "warn", },);
    }

    root.setLevel("warn",);
    root.addTransport({
      name: "probe",
      write: async (entry,) => {
        entries.push(entry,);
      },
      flush: async () => {},
    },);

    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true, },);
    }
  },);

  test("a plugin directory without plugin.ts is logged, not skipped silently", async () => {
    entries.length = 0;
    const dir = makePluginDir({ "README.md": "no entry point here", },);

    await loadSinglePlugin(db, "fixture-missing-entry", dir, "local",);
    await root.flush();

    const warnings = entries.filter((entry,) => entry.level === 30,);
    expect(warnings.length,).toBeGreaterThan(0,);
    expect(JSON.stringify(warnings,),).toContain("fixture-missing-entry",);
  },);

  test("a plugin with an invalid manifest is logged with its name", async () => {
    entries.length = 0;
    const dir = makePluginDir({ "plugin.ts": `export const plugin = { label: "no name here" };`, },);

    await loadSinglePlugin(db, "fixture-invalid-manifest", dir, "local",);
    await root.flush();

    const warnings = entries.filter((entry,) => entry.level === 30,);
    expect(warnings.length,).toBeGreaterThan(0,);
    expect(JSON.stringify(warnings,),).toContain("fixture-invalid-manifest",);
  },);

  test("a plugin that throws while loading is logged with its stack", async () => {
    entries.length = 0;
    const dir = makePluginDir({ "plugin.ts": `throw new Error("fixture-load-boom");`, },);

    await loadSinglePlugin(db, "fixture-load-boom", dir, "local",);
    await root.flush();

    const errors = entries.filter((entry,) => entry.level === 40,);
    expect(errors.length,).toBeGreaterThan(0,);
    const logged = errors[0]!.error ?? "";
    expect(logged,).toContain("fixture-load-boom",);
    // The stack survives — String(error) used to drop it.
    expect(logged,).toContain("at ",);
  },);
});

/**
 * A Kysely handle whose plugin_state reads always reject with a transient
 * fault (not a missing-table error).
 * @returns The failing db handle
 */
function lockedStateDb(): Kysely<DB> {
  const chain = {
    select: () => chain,
    where: () => chain,
    executeTakeFirst: () => Promise.reject(new Error("database is locked",),),
    execute: () => Promise.reject(new Error("database is locked",),),
  } as never;

  return { selectFrom: () => chain, } as unknown as Kysely<DB>;
}

/**
 * A Kysely handle whose plugin_state reads reject with the pre-migration
 * missing-table error.
 * @returns The failing db handle
 */
function noSuchTableDb(): Kysely<DB> {
  const chain = {
    select: () => chain,
    where: () => chain,
    executeTakeFirst: () => Promise.reject(new Error("no such table: plugin_state",),),
    execute: () => Promise.reject(new Error("no such table: plugin_state",),),
  } as never;

  return { selectFrom: () => chain, } as unknown as Kysely<DB>;
}

// BUG-ispluginactive-fails-open-for-core-plugins-on-any-db-error: the bare
// catch used to fall through to `origin === "core"`, so ANY plugin_state read
// failure re-approved every core plugin. Unexpected faults must fail closed;
// only the missing-table first boot keeps the origin default.
describe("plugin_state read failures fail closed", () => {
  let db: Kysely<DB>;
  let root: Logger;
  const entries: LogEntry[] = [];

  beforeAll(async () => {
    try {
      root = getLogger();
    } catch {
      root = createLogger({ level: "warn", },);
    }

    root.setLevel("warn",);
    root.addTransport({
      name: "probe-state",
      write: async (entry,) => {
        entries.push(entry,);
      },
      flush: async () => {},
    },);

    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true, },);
    }
  },);

  test("a transient plugin_state read failure disables a core plugin", async () => {
    entries.length = 0;
    const dir = makePluginDir({
      "plugin.ts": `export const plugin = { name: "fixture-core-locked", version: "1.0.0", description: "locked fixture", author: "test", };`,
    },);

    await loadSinglePlugin(lockedStateDb(), "fixture-core-locked", dir, "core",);
    await root.flush();

    expect(registry.isEnabled("fixture-core-locked",),).toBe(false,);
    const errors = entries.filter((entry,) => entry.level === 40,);
    expect(JSON.stringify(errors,),).toContain("failing closed",);
    expect(JSON.stringify(errors,),).toContain("fixture-core-locked",);
  },);

  test("a missing plugin_state table still falls back to the origin default", async () => {
    const dir = makePluginDir({
      "plugin.ts": `export const plugin = { name: "fixture-core-firstboot", version: "1.0.0", description: "firstboot fixture", author: "test", };`,
    },);

    await loadSinglePlugin(noSuchTableDb(), "fixture-core-firstboot", dir, "core",);

    expect(registry.isEnabled("fixture-core-firstboot",),).toBe(true,);
  },);
});
