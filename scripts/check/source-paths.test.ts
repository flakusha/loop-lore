// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { expect, test, } from "bun:test";
import { resolve, } from "node:path";

import { changedModules, isScopedDiffSrcFile, } from "./parallel/context.mjs";
import { moduleName, SOURCE_ROOTS, TEST_ROOTS, walkTestFiles, } from "./source-paths.mjs";

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
