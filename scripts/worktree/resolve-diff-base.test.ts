// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for resolveDiffBase — the helper that decides which git ref to
 * hand to `bun run check --diff-base` during `worktree finalize` Step 2.
 *
 * Contract: return the TARGET BRANCH, validated. Not its merge-base with
 * HEAD. The runner scopes to files whose content differs between the given ref
 * and HEAD, so a merge-base SHA pins the comparison to the fork point and
 * keeps every file the target has since reproduced identically in scope — the
 * over-report that scoping fix removed. (resolveDiffBase previously returned
 * the merge-base; under the old merge-base diff in the runner that was
 * equivalent to passing the target, which is why the change was needed only
 * once the runner moved to a two-dot diff.)
 *
 * Setup strategy: build a real tiny git history with a shared base commit,
 * then advance the target past the base. Asserting on the resolved ref proves
 * the helper returns the live target rather than the moving ancestor.
 *
 * Resource contract: each test owns one `mkdtemp` repo under the OS temp dir
 * (prefix `loop-lore-resolve-diff-base-`), rebuilt in `beforeEach` and removed in
 * `afterEach`; the throws-case builds its own `loop-lore-orphan-` repo inline
 * under `try`/`finally`. Nothing touches the real repo, no path is shared
 * between tests, and the suite is safe to run concurrently with itself.
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import { resolveDiffBase, } from "./commands/finalize";

let workDir: string;
let baseSha: string;

function run(cmd: string[], cwd: string,): string {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe", },);
  if (proc.exitCode !== 0) {
    const err = proc.stderr.toString();
    throw new Error("Command failed: " + cmd.join(" ",) + " stderr=" + err,);
  }
  return proc.stdout.toString().trim();
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "loop-lore-resolve-diff-base-",),);
  // init, identity, initial commit on master
  run(["git", "init", "--initial-branch=master",], workDir,);
  run(["git", "config", "user.email", "test@example.com",], workDir,);
  run(["git", "config", "user.name", "Test",], workDir,);
  run(["git", "commit", "--allow-empty", "-m", "base",], workDir,);
  baseSha = run(["git", "rev-parse", "HEAD",], workDir,);

  // create a branch `feature` at base, advance master (the "target")
  run(["git", "checkout", "-b", "feature",], workDir,);
  run(["git", "checkout", "master",], workDir,);
  run(["git", "commit", "--allow-empty", "-m", "advance-on-target",], workDir,);
  run(["git", "checkout", "feature",], workDir,);
  // Now: feature HEAD == base, master HEAD is one commit ahead.
  // merge-base(feature, master) should be baseSha, not master's HEAD.
},);

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true, },);
},);

describe("resolveDiffBase", () => {
  it("returns the target branch even after it has moved past the fork", () => {
    // Regression: returning the merge-base here pinned the scoped diff to the
    // fork point, so every file `master` reproduced identically afterwards
    // stayed floored. The runner needs the live target to drop those.
    const got = resolveDiffBase(workDir, "master",);
    expect(got,).toBe("master",);
    expect(got,).not.toBe(baseSha,);
  });

  it("returns the target when HEAD is already on it", () => {
    run(["git", "checkout", "master",], workDir,);
    const got = resolveDiffBase(workDir, "master",);
    expect(got,).toBe("master",);
  });

  it("accepts a SHA, a tag, and a remote-tracking ref alike", () => {
    // The helper forwards whatever ref form it is given; validation must not
    // reject refs that are not literal branch names.
    const sha = run(["git", "rev-parse", "master",], workDir,);
    expect(resolveDiffBase(workDir, sha,),).toBe(sha,);

    run(["git", "tag", "v1",], workDir,);
    expect(resolveDiffBase(workDir, "v1",),).toBe("v1",);

    run(["git", "update-ref", "refs/remotes/origin/master", "master",], workDir,);
    expect(resolveDiffBase(workDir, "origin/master",),).toBe("origin/master",);
  });

  it("throws when the target is not a valid ref", () => {
    // A typo must fail here with a clear message instead of surfacing as a
    // confusing stack trace from inside the runner. Production callers always
    // pass a valid ref, so this is defensive against bad input.
    const orphanDir = mkdtempSync(join(tmpdir(), "loop-lore-orphan-",),);
    try {
      run(["git", "init", "--initial-branch=main",], orphanDir,);
      run(["git", "config", "user.email", "test@example.com",], orphanDir,);
      run(["git", "config", "user.name", "Test",], orphanDir,);
      run(["git", "commit", "--allow-empty", "-m", "lonely",], orphanDir,);
      expect(() => resolveDiffBase(orphanDir, "does-not-exist",)).toThrow(
        /rev-parse/,
      );
    } finally {
      rmSync(orphanDir, { recursive: true, force: true, },);
    }
  });
});
