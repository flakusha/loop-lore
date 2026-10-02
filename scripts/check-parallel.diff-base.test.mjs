// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Regression tests for `changedFiles()` in `scripts/check-parallel.mjs` —
 * the file set `--diff-base` scopes the unit + coverage gates to.
 *
 * Regression target: `changedFiles` resolved `git merge-base <base> HEAD` and
 * diffed against THAT. A merge-base diff answers "which files did the branch
 * touch since the fork", which is a superset of the files the branch will
 * actually change when it lands: once `base` moved on and independently
 * reproduced some of the branch's work, those files hold identical content on
 * both sides, and merging them changes nothing. The coverage gate still floored
 * each of them as a whole file, so a long-lived branch got blocked on coverage
 * debt it no longer carried.
 *
 * Fixture: a temp git repo where `feature` forks from `main`, diverges, and
 * `main` then advances — independently reproducing one of the branch's edits
 * byte-for-byte. That converged file is the regression: it must NOT be floored.
 *
 * Resource contract: each test owns exactly one `mkdtemp` repo under the OS
 * temp dir, rebuilt per test in `beforeEach` and removed in `afterEach`, so the
 * suite is safe to run concurrently with itself and with other temp-repo suites
 * (the `loop-lore-diff-base-` prefix keeps it clear of the `loop-lore-orphan-`
 * repo the unrelated-histories test builds inline). Nothing is written outside
 * that dir, no fixed path is shared, and no test reads another's fixture.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import { changedFiles, } from "./check-parallel.mjs";

let workDir;

function git(args, cwd = workDir,) {
  const proc = spawnSync("git", args, { cwd, encoding: "utf8", },);
  if (proc.status !== 0) {
    throw new Error(`git ${args.join(" ",)} failed: ${proc.stderr}`,);
  }
  return proc.stdout.trim();
}

function write(relPath, content,) {
  writeFileSync(join(workDir, relPath,), content,);
}

/** The set the pre-fix merge-base diff produced over this same fixture. */
function mergeBaseSet() {
  return git(["diff", "--name-only", git(["merge-base", "main", "HEAD",],),],).split("\n",);
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "loop-lore-diff-base-",),);
  git(["init", "--initial-branch=main", "-q",],);
  git(["config", "user.email", "test@example.com",],);
  git(["config", "user.name", "Test",],);
  mkdirSync(join(workDir, "src",), { recursive: true, },);

  // Fork point.
  write("src/a.ts", "export const a = 1;\n",);
  write("src/converged.ts", "export const c = 1;\n",);
  git(["add", ".",],);
  git(["commit", "-q", "-m", "fork point",],);

  // Branch diverges on BOTH files.
  git(["checkout", "-q", "-b", "feature",],);
  write("src/a.ts", "export const a = 2;\n",);
  write("src/converged.ts", "export const c = 2;\n",);
  git(["add", ".",],);
  git(["commit", "-q", "-m", "feature work",],);

  // `main` advances and independently reproduces the `converged.ts` edit
  // byte-for-byte. `a.ts` is untouched on `main`, so it stays divergent.
  git(["checkout", "-q", "main",],);
  write("src/converged.ts", "export const c = 2;\n",);
  git(["add", ".",],);
  git(["commit", "-q", "-m", "base advances",],);

  git(["checkout", "-q", "feature",],);
},);

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true, },);
},);

describe("changedFiles — --diff-base scoping", () => {
  test("the fixture reproduces the pre-fix over-report", () => {
    // Guards the regression itself: if this stops holding, the merge-base diff
    // no longer over-reports here and the tests below prove nothing.
    expect(mergeBaseSet(),).toEqual(["src/a.ts", "src/converged.ts",],);
  });

  test("excludes a file the base reproduced identically", () => {
    // Identical content on both sides: landing this branch changes nothing
    // there, so flooring the whole file is the false red being fixed.
    expect(changedFiles("main", workDir,),).not.toContain("src/converged.ts",);
  });

  test("includes a file the branch genuinely diverged on", () => {
    expect(changedFiles("main", workDir,),).toContain("src/a.ts",);
  });

  test("returns exactly the divergent set", () => {
    expect(changedFiles("main", workDir,),).toEqual(["src/a.ts",],);
  });

  test("includes uncommitted working-tree changes", () => {
    // The dirty half of the union must survive the fix: a file edited but not
    // yet committed still has to be gated.
    write("src/a.ts", "export const a = 3;\n",);
    write("src/new.ts", "export const n = 1;\n",);
    git(["add", "src/new.ts",],);

    const files = changedFiles("main", workDir,);
    expect(files,).toContain("src/new.ts",);
    expect(files,).toContain("src/a.ts",);
  });

  test("empty when no base is given", () => {
    expect(changedFiles(null, workDir,),).toEqual([],);
  });

  test("a base with no common ancestor does not throw", () => {
    // `git merge-base` exits non-zero on unrelated histories, which took the
    // whole runner down before any gate ran. `git diff A B` needs no ancestor,
    // so this degrades to a result instead of crashing.
    const orphan = mkdtempSync(join(tmpdir(), "loop-lore-orphan-",),);
    try {
      spawnSync("git", ["init", "-q", "--initial-branch=main", orphan,],);
      spawnSync("git", ["-C", orphan, "config", "user.email", "test@example.com",],);
      spawnSync("git", ["-C", orphan, "config", "user.name", "Test",],);
      spawnSync("git", ["-C", orphan, "commit", "-q", "--allow-empty", "-m", "unrelated",],);
      git(["fetch", "-q", orphan, "main:refs/remotes/orphan/main",],);

      // Pins the pre-fix crash: merge-base finds no common ancestor here.
      expect(
        spawnSync("git", ["merge-base", "orphan/main", "HEAD",], { cwd: workDir, },).status,
      ).not.toBe(0,);
      expect(() => changedFiles("orphan/main", workDir,)).not.toThrow();
    } finally {
      rmSync(orphan, { recursive: true, force: true, },);
    }
  });
});
