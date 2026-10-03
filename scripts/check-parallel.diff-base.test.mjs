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
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
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

  test("an untracked working-tree file is NOT gated", () => {
    // `git diff --name-only HEAD` only sees TRACKED changes, so a new source
    // file that was never `git add`ed stays invisible to the scope. Pinned so
    // the hole is a documented decision rather than a surprise: if a future fix
    // folds `git ls-files --others` in, this goes red and the AGENTS.md note
    // gets corrected with it.
    write("src/never-added.ts", "export const n = 1;\n",);
    expect(git(["status", "--porcelain",],),).toContain("?? src/never-added.ts",);
    expect(changedFiles("main", workDir,),).not.toContain("src/never-added.ts",);
  });

  test("a missing base ref throws", () => {
    // `execFileSync` propagates git's non-zero exit, and this runs at module
    // init — before `main()` — so it is not caught by the runner's error
    // handler. `resolveDiffBase` (finalize) validates the ref first, which is
    // why the production path still gets a readable message.
    expect(() => changedFiles("no-such-ref", workDir,)).toThrow();
  });

  test("a base equal to HEAD yields an empty diff", () => {
    // Nothing to gate. Downstream this is the NOOP_OK path: the coverage gate
    // reports `true # diff-scope: no matching files` rather than running.
    expect(changedFiles("feature", workDir,),).toEqual([],);
  });

  test("rename-only, mode-only and whitespace-only changes are all in scope", () => {
    // These three hold IDENTICAL content on both sides, yet `git diff
    // --name-only` still lists them (rename shows the destination path only).
    // That over-scopes rather than under-scopes, which costs a false red at
    // worst — the safe direction — so it is pinned as known behaviour, not
    // filtered. The filter that would remove them (`-w`, a whitespace-aware
    // diff) would risk dropping a real change.
    write("src/renamed-from.ts", "export const r = 1;\n",);
    write("src/mode-only.ts", "export const m = 1;\n",);
    write("src/ws-only.ts", "export const w = 1;\n",);
    git(["add", "-A",],);
    git(["commit", "-q", "-m", "seeds",],);
    git(["mv", "src/renamed-from.ts", "src/renamed-to.ts",],);
    // Mode has to change on disk and then be staged; `update-index --chmod`
    // alone leaves the worktree copy at 644 and git sees no difference.
    chmodSync(join(workDir, "src", "mode-only.ts",), 0o755,);
    write("src/ws-only.ts", "export const w = 1;   \n\n",);
    git(["add", "-A",],);
    git(["commit", "-q", "-m", "non-content changes",],);
    const files = changedFiles("HEAD~1", workDir,);
    expect(files,).toContain("src/renamed-to.ts",);
    expect(files,).toContain("src/mode-only.ts",);
    expect(files,).toContain("src/ws-only.ts",);
    // The rename SOURCE is not listed: with rename detection on, `--name-only`
    // reports the destination alone, so the old path is not asked for.
    expect(files,).not.toContain("src/renamed-from.ts",);
  });

  test("a deleted source file is listed without breaking the scope", () => {
    // A deleted `src/x.ts` has no adjacent test to run and no module dir to
    // scan. It is listed (it IS a change) but every downstream consumer must
    // tolerate it: `scopedTestFiles` exists-checks before adding, and
    // `coverage.mjs --files=` reports a file absent from lcov as SKIP rather
    // than 0%. This pins the listing half; the tolerance halves are asserted by
    // the coverage gate's own behaviour.
    git(["rm", "-q", "src/converged.ts",],);
    git(["commit", "-q", "-m", "delete a source file",],);
    expect(changedFiles("HEAD~1", workDir,),).toContain("src/converged.ts",);
    // The sibling `src/a.ts` module still scopes normally alongside it.
    expect(changedFiles("main", workDir,),).toContain("src/a.ts",);
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
