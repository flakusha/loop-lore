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
