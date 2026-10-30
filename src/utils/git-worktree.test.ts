// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import * as realFs from "node:fs";
import { mkdirSync, rmSync, writeFileSync, } from "node:fs";
import { createRequire, } from "node:module";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";
import { findMainRepoRoot, } from "./git-worktree.ts";

// The module under test reads through the default import
// (`import fs from "node:fs"`), which binds the CJS module OBJECT — the only
// form the sandbox can intercept. Bun's mock.module replaces the ESM
// namespace, which a default-import consumer never reads, so the double has
// to patch the module object itself.
// TODO(env): bun-only — `mock.module` is Bun's module-mocking API and the
// CJS-object identity this double relies on is Bun's. A Node test target needs
// a different double (Node's ESM namespace is immutable), so port this test
// when a Node runner lands.
const fsModule = createRequire(import.meta.url,)("node:fs",) as {
  statSync: (path: string, options?: object,) => unknown;
};

// Captured before the double installs; the double delegates to this, so a
// re-patch can never make it call itself.
const realStatSync = realFs.statSync;

// ISOLATED-gated node:fs double — pure pass-through except an injectable
// statSync failure, reaching the two stat-failure catch paths added by the
// cause-logging commit. The double pins nothing (every other call hits the
// real fs). The gated suite below imports the module under a cache-busting
// specifier so it evaluates WITH the double; the shared-process describe
// above keeps the plain static import.
let failStat: ((p: string,) => boolean) | null = null;
if (ISOLATED) {
  fsModule.statSync = (p: string, opts?: object,): unknown => {
    if (failStat?.(String(p,),)) { throw new Error("injected stat failure",); }
    return realStatSync(p, opts as never,);
  };
}

describe("findMainRepoRoot", () => {
  test("returns null when not in a git directory", () => {
    const cwd = tmpdir();
    expect(findMainRepoRoot(cwd,),).toBeNull();
  });

  test("returns null when .git is a directory (not worktree)", () => {
    const tempDir = join(tmpdir(), `test-git-dir-${Date.now()}-${Math.random()}`,);
    mkdirSync(tempDir, { recursive: true, },);
    const gitDir = join(tempDir, ".git",);
    mkdirSync(gitDir,);
    try {
      expect(findMainRepoRoot(tempDir,),).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true, },);
    }
  });

  test("returns null when .git file has no gitdir: prefix", () => {
    const tempDir = join(tmpdir(), `test-no-gitdir-${Date.now()}-${Math.random()}`,);
    mkdirSync(tempDir, { recursive: true, },);
    const gitFile = join(tempDir, ".git",);
    writeFileSync(gitFile, "not a worktree ref\n",);
    try {
      expect(findMainRepoRoot(tempDir,),).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true, },);
    }
  });

  test("returns null when gitdir path does not lead to a valid main repo .git dir", () => {
    const tempDir = join(tmpdir(), `test-no-main-${Date.now()}-${Math.random()}`,);
    mkdirSync(tempDir, { recursive: true, },);
    // gitdir points to /nonexistent/.git/worktrees/something — no main .git dir exists
    const gitFile = join(tempDir, ".git",);
    writeFileSync(gitFile, "gitdir: /nonexistent/.git/worktrees/branch\n",);
    try {
      expect(findMainRepoRoot(tempDir,),).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true, },);
    }
  });

  test("returns main repo root when .git is a valid worktree file", () => {
    // Simulate: /tmp/<main>/.git is a real dir
    // and /tmp/<main>/.git/worktrees/<wt>/ is the worktree
    const mainDir = join(tmpdir(), `test-main-${Date.now()}-${Math.random()}`,);
    const worktreesDir = join(mainDir, ".git", "worktrees",);
    const worktreeBranchDir = join(worktreesDir, "feature-test",);
    const worktreeDir = join(tmpdir(), `test-wt-${Date.now()}-${Math.random()}`,);

    mkdirSync(join(mainDir, ".git",), { recursive: true, },);
    mkdirSync(worktreeBranchDir, { recursive: true, },);
    mkdirSync(worktreeDir, { recursive: true, },);

    const gitFile = join(worktreeDir, ".git",);
    writeFileSync(gitFile, `gitdir: ${worktreeBranchDir}\n`,);

    try {
      expect(findMainRepoRoot(worktreeDir,),).toBe(mainDir,);
    } finally {
      rmSync(mainDir, { recursive: true, force: true, },);
      rmSync(worktreeDir, { recursive: true, force: true, },);
    }
  });
});

describeOrSkip("findMainRepoRoot stat-failure paths", () => {
  let findWithFail: (cwd: string,) => string | null;

  beforeAll(async () => {
    // Cache-buster: a distinct specifier evaluates git-worktree.ts fresh, so
    // its node:fs import binds to the double installed above. Kept a dynamic
    // (non-literal) specifier so tsc does not try to resolve the query form.
    const bust = "./git-worktree.ts" + "?stat-fail";
    const mod = (await import(bust)) as typeof import("./git-worktree.ts");
    findWithFail = mod.findMainRepoRoot;
  },);

  test("logs and returns null when stat on the worktree .git throws", () => {
    const mainDir = join(tmpdir(), `test-main-${Date.now()}-${Math.random()}`,);
    const worktreeDir = join(tmpdir(), `test-wt-${Date.now()}-${Math.random()}`,);
    mkdirSync(join(mainDir, ".git",), { recursive: true, },);
    mkdirSync(worktreeDir, { recursive: true, },);
    writeFileSync(join(worktreeDir, ".git",), `gitdir: ${join(mainDir, ".git", "worktrees", "br",)}\n`,);
    failStat = () => true;
    try {
      expect(findWithFail(worktreeDir,),).toBeNull();
    } finally {
      failStat = null;
      rmSync(mainDir, { recursive: true, force: true, },);
      rmSync(worktreeDir, { recursive: true, force: true, },);
    }
  });

  test("logs and returns null when stat on the main .git throws", () => {
    const mainDir = join(tmpdir(), `test-main-${Date.now()}-${Math.random()}`,);
    const worktreeDir = join(tmpdir(), `test-wt-${Date.now()}-${Math.random()}`,);
    mkdirSync(join(mainDir, ".git",), { recursive: true, },);
    mkdirSync(worktreeDir, { recursive: true, },);
    writeFileSync(join(worktreeDir, ".git",), `gitdir: ${join(mainDir, ".git", "worktrees", "br",)}\n`,);
    failStat = (p,) => p === join(mainDir, ".git",);
    try {
      expect(findWithFail(worktreeDir,),).toBeNull();
    } finally {
      failStat = null;
      rmSync(mainDir, { recursive: true, force: true, },);
      rmSync(worktreeDir, { recursive: true, force: true, },);
    }
  });
},);
