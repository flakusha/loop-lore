// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, resolve, } from "node:path";

import { changedModules, isScopedDiffSrcFile, } from "./parallel/context.mjs";
import { moduleName, SOURCE_ROOTS, TEST_ROOTS, walkTestFiles, } from "./source-paths.mjs";

// RESOURCE CONTRACT — what this file owns:
// - DISK: one `mkdtempSync(join(tmpdir(), "source-paths-workspace-"))` root per
//   test that needs a synthetic workspace tree. mkdtemp's random suffix is
//   atomic, so concurrent runs cannot collide on a path.
// - No ports, no shared globals, no ordering dependence; `tempDirs` is the only
//   module-level state and `afterEach` drains it, so a failing test cannot
//   leak a fixture into the next one.
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0,)) {
    rmSync(dir, { recursive: true, force: true, },);
  }
},);

test("test roots are a single flat registry", () => {
  expect(TEST_ROOTS.src,).toBe("src",);
  expect(TEST_ROOTS.packages,).toBe("packages",);
  expect(TEST_ROOTS.e2e,).toBe("tests/e2e/",);
  expect(TEST_ROOTS.plugins,).toBe("plugins",);
  expect(TEST_ROOTS.scripts,).toBe("scripts",);
});

test("scanner roots cover app and package sources", () => {
  expect(SOURCE_ROOTS,).toEqual(["src/", "packages/",],);
  for (const file of ["src/chat/x.ts", "packages/core/src/config/x.ts",]) {
    expect(SOURCE_ROOTS.some((root,) => file.startsWith(root,)),).toBe(true,);
  }
});

test("module bucketing keeps core flat and prefixes other workspaces", () => {
  expect(moduleName("src/chat/service.ts",),).toBe("chat",);
  expect(moduleName("src/root.ts",),).toBe("(root)",);
  expect(moduleName("packages/core/src/config/x.ts",),).toBe("config",);
  expect(moduleName("packages/other/src/config/x.ts",),).toBe("other:config",);
});

test("diff scoping recognises any workspace source tree", () => {
  expect(changedModules(["packages/foo/src/chat/x.ts",],),).toEqual(["packages/foo/src/chat",],);
  expect(isScopedDiffSrcFile("packages/foo/src/chat/x.ts",),).toBe(true,);
  expect(isScopedDiffSrcFile("packages/foo/src/chat/x.test.ts",),).toBe(false,);
});

test("gate discovery sees package tests, not only src shims", () => {
  const root = resolve(import.meta.dir, "..", "..",);
  const found = walkTestFiles(root, TEST_ROOTS.packages,);
  expect(found.some((file,) => file.startsWith("packages/core/src/native/",) && file.endsWith(".test.ts",)),).toBe(
    true,
  );
});

test("a synthetic second workspace is discovered by the registry", () => {
  const root = mkdtempSync(join(tmpdir(), "source-paths-workspace-",),);
  tempDirs.push(root,);
  const workspace = join(root, "packages", "widgets", "src", "config",);
  mkdirSync(workspace, { recursive: true, },);
  writeFileSync(join(workspace, "schema.test.ts",), "export {};\n",);

  const found = walkTestFiles(root, TEST_ROOTS.packages,);
  expect(found,).toEqual([join("packages", "widgets", "src", "config", "schema.test.ts",),],);
  expect(moduleName(found[0]!,),).toBe("widgets:config",);
  expect(isScopedDiffSrcFile(join("packages", "widgets", "src", "config", "schema.ts",),),).toBe(true,);
  expect(changedModules([join("packages", "widgets", "src", "config", "schema.ts",),],),).toEqual([
    "packages/widgets/src/config",
  ],);
});
