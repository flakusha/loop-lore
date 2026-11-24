// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { readdirSync, readFileSync, } from "node:fs";
import { join, relative, } from "node:path";

// Built at runtime so the guard itself cannot match its own source.
const ALIAS = "@" + "/";
const IMPORT_PATTERN = new RegExp("(?:from\\s+|import\\s*\\(|require\\s*\\()\\s*[\"']" + ALIAS,);

function sourceFiles(dir: string,): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
    if (entry.isSymbolicLink()) { continue; }
    const path = join(dir, entry.name,);
    if (entry.isDirectory()) { found.push(...sourceFiles(path,),); }
    else if (/\.tsx?$/.test(entry.name,)) { found.push(path,); }
  }
  return found;
}

describe("core package boundary", () => {
  test("core sources never import the app alias", () => {
    // TODO(env): bun-only — use fileURLToPath(import.meta.url) dirname when a Node test target lands.
    const root = import.meta.dir;
    const files = sourceFiles(root,);
    expect(files.length,).toBeGreaterThan(100,);
    expect(files.includes(join(root, "index.ts",),),).toBe(true,);

    const offenders = files.filter((path,) => IMPORT_PATTERN.test(readFileSync(path, "utf8",),));
    expect(offenders.map((path,) => relative(root, path,)),).toEqual([],);
  });

  test("alias detector flags an aliased import but not a relative one", () => {
    expect(IMPORT_PATTERN.test('import { x, } from "' + ALIAS + 'x";',),).toBe(true,);
    expect(IMPORT_PATTERN.test('import { x, } from "./x";',),).toBe(false,);
  });
});
