// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Import purity for the pi-tui TUI:
 *
 * 1. Source-level: no module may import the `@oh-my-pi/pi-tui` ROOT barrel —
 *    only package subpaths (see src/tui/pi.ts for why).
 * 2. Runtime: importing every module under src/tui/ must construct no TUI
 *    engine and touch no terminal (the entry guard in app.ts keeps the
 *    module inert until `createTUIApp()`).
 */
import { describe, expect, it, } from "bun:test";
import { readdirSync, readFileSync, } from "node:fs";
import { join, } from "node:path";

/** Collect every TS module under src/tui (tests excluded from the rule). */
function tuiModules(dir: string,): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
    const full = join(dir, entry.name,);
    if (entry.isDirectory()) { out.push(...tuiModules(full,),); }
    else if (entry.name.endsWith(".ts",) && !entry.name.includes(".test.",)) {
      out.push(full,);
    }
  }

  return out;
}

describe("tui import purity", () => {
  it("discovers modules under src/tui/", () => {
    expect(tuiModules(join(import.meta.dir,),).length,).toBeGreaterThan(10,);
  });

  it("imports every module through subpaths only — never the root barrel", () => {
    const offenders: string[] = [];
    for (const file of tuiModules(join(import.meta.dir,),)) {
      const source = readFileSync(file, "utf8",);
      if (/from\s+"@oh-my-pi\/pi-tui"/.test(source,) || /import\(["']@oh-my-pi\/pi-tui["']\)/.test(source,)) {
        offenders.push(file,);
      }
    }

    expect(offenders,).toEqual([],);
  });

  it("imports every module without side effects", async () => {
    const modules = tuiModules(join(import.meta.dir,),);
    for (const file of modules) {
      const specifier = `./${file.slice(import.meta.dir.length + 1,).replaceAll("\\", "/",)}`;
      // Dynamic by design: this test exercises the module loading boundary
      // itself. A module that constructs a renderer or grabs the terminal at
      // import time fails here under the non-TTY test environment.
      await import(specifier);
    }

    expect(modules.length,).toBeGreaterThan(0,);
  });
});
