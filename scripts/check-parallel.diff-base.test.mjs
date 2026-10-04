// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Regression tests for `changedFiles()` in `scripts/check/parallel/context.mjs` —
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
 * that dir, no fixed path is shared, and no test reads another's fixture. The
 * tests that commit extra history (rename/mode/whitespace, delete) own only
 * their own `workDir`; the mode test's `chmodSync` lands inside it too.
 *
 * Host-config contract: every git call goes through `gitRaw`/`git`, which pin
 * `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` to /dev/null and strip the `GIT_*`
 * vars that would redirect the repo. Without that, a developer with
 * `commit.gpgsign=true` globally gets 12/12 failures here — the fixture's
 * commits try to sign with the throwaway `Test <test@example.com>` identity and
 * die on "No secret key". Same class as the weave-damage fixture, which had to
 * strip the host git env for the same reason.
 */

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import { changedFiles, } from "./check/parallel/context.mjs";

let workDir;

/**
 * Environment for every git call in this file: no global/system config (so no
 * inherited `commit.gpgsign`, `core.hooksPath`, `status.showUntrackedFiles`, or
 * `init.defaultBranch`), and no `GIT_*` var pointing git at another repo.
 */
const GIT_ENV = Object.fromEntries(
  Object.entries(process.env,).filter(([k,],) =>
    ![
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_INDEX_FILE",
      "GIT_COMMON_DIR",
      "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    ].includes(k,)
  ),
);
GIT_ENV.GIT_CONFIG_GLOBAL = "/dev/null";
GIT_ENV.GIT_CONFIG_SYSTEM = "/dev/null";
// Identity via env, not `git config`: with the configs nulled there is no
// fallback, so every commit here proves it took the env identity. Also keeps
// the fixture free of any config WRITE — a `git config <key> <value>` call is
// prohibited outright, and a persisted setting outlives the temp repo anyway.
GIT_ENV.GIT_AUTHOR_NAME = "Test";
GIT_ENV.GIT_AUTHOR_EMAIL = "test@example.com";
GIT_ENV.GIT_COMMITTER_NAME = "Test";
GIT_ENV.GIT_COMMITTER_EMAIL = "test@example.com";

/** Raw git: no throw, so callers can assert on a non-zero exit. */
function gitRaw(args, cwd = workDir,) {
  return spawnSync("git", args, { cwd, encoding: "utf8", env: GIT_ENV, },);
}

function git(args, cwd = workDir,) {
  const proc = gitRaw(args, cwd,);
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

/** `GIT_*` vars that redirect git at another repo; see GIT_ENV. */
const REDIRECT_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
];

/** Saved values for REDIRECT_VARS, restored in `afterEach`. */
const savedEnv = new Map();

beforeEach(() => {
  // `changedFiles` is the code under test and runs `execFileSync` IN-PROCESS, so
  // it reads `process.env` directly — the GIT_ENV above cannot reach it. Scrub
  // here or a `GIT_DIR` in the ambient environment (a git hook, a CI runner that
  // exports one) makes git ignore the fixture's `cwd` and resolve `main` against
  // the host repo. Restored in `afterEach`, so nothing leaks into a sibling file.
  for (const key of REDIRECT_VARS) {
    savedEnv.set(key, process.env[key],);
    delete process.env[key];
  }

  workDir = mkdtempSync(join(tmpdir(), "loop-lore-diff-base-",),);
  git(["init", "--initial-branch=main", "-q",],);
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
  // Restore first: a leaked GIT_DIR would poison every later file in the run.
  for (const [key, value,] of savedEnv) {
    if (value === undefined) { delete process.env[key]; }
    else {
      process.env[key] = value;
    }
  }
  savedEnv.clear();
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
    // `-uall` explicit: the proof that the file is untracked must not depend on
    // the developer's `status.showUntrackedFiles` setting.
    expect(git(["status", "--porcelain", "-uall",],),).toContain("?? src/never-added.ts",);
    expect(changedFiles("main", workDir,),).not.toContain("src/never-added.ts",);
  });

  test("a missing base ref throws an Error naming the ref", () => {
    // `changedFiles` still throws (the module-init call site catches it and
    // exits), but the throw now carries an actionable message instead of a raw
    // `execFileSync` dump: the runner used to die with a Bun stack trace and NO
    // check report when a `--diff-base` ref did not resolve. Pin both halves —
    // that it throws, and that the message names the ref and a valid ref shape.
    let thrown;
    try {
      changedFiles("no-such-ref", workDir,);
    } catch (error) {
      thrown = error;
    }
    expect(thrown,).toBeInstanceOf(Error,);
    expect(thrown.message,).toContain("no-such-ref",);
    expect(thrown.message,).toContain("commit sha",);
    // One line: the runner prints this verbatim, so a multi-line message
    // re-creates the wall-of-noise failure this wrap was meant to remove.
    expect(thrown.message.split("\n",).length,).toBe(1,);
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
    // tolerate it: `scopedCoveragePaths` filters the module to dirs that still
    // exist, and `coverage.mjs --files=` reports a file absent from lcov as SKIP
    // rather than 0%. This pins the listing half; the tolerance halves are
    // asserted by the coverage gate's own behaviour.
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
      git(["init", "-q", "--initial-branch=main", orphan,], workDir,);
      git(["-C", orphan, "commit", "-q", "--allow-empty", "-m", "unrelated",], workDir,);
      git(["fetch", "-q", orphan, "main:refs/remotes/orphan/main",],);

      // Pins the pre-fix crash: merge-base finds no common ancestor here.
      expect(gitRaw(["merge-base", "orphan/main", "HEAD",],).status,).not.toBe(0,);
      expect(() => changedFiles("orphan/main", workDir,)).not.toThrow();
    } finally {
      rmSync(orphan, { recursive: true, force: true, },);
    }
  });
});
