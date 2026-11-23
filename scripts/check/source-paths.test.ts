// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { expect, test, } from "bun:test";

import { changedModules, isScopedDiffSrcFile, } from "./parallel/context.mjs";
import { moduleName, TEST_ROOTS, } from "./source-paths.mjs";

test("test roots are a single flat registry", () => {
  expect(TEST_ROOTS.src,).toBe("src",);
  expect(TEST_ROOTS.e2e,).toBe("tests/e2e/",);
  expect(TEST_ROOTS.plugins,).toBe("plugins",);
  expect(TEST_ROOTS.scripts,).toBe("scripts",);
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
