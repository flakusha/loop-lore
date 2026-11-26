// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression guard for `runGit`'s explicit cwd and scrubbed environment.
 *
 * Resource contract: each test owns a private `mkdtemp` git repo created and
 * removed by `withRepo`; no path or git state is shared between tests. The env
 * test restores `process.env.GIT_CONFIG_GLOBAL` in `finally`, so no ambient
 * state outlives it. Safe in any order.
 */
import { describe, expect, test, } from "bun:test";
import { execFileSync, } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { runGit, } from "./run-context";

/**
 * @param fn - test body receiving a fresh git repo root
 * @returns void
 */
function withRepo(fn: (dir: string,) => void,): void {
  const dir = mkdtempSync(join(tmpdir(), "loop-lore-rungit-",),);
  try {
    execFileSync("git", ["init", "-q", dir,], {
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", },
      stdio: "ignore",
    },);

    fn(dir,);
  } finally {
    rmSync(dir, { recursive: true, force: true, },);
  }
}

describe("runGit", () => {
  test("runs git in the explicit cwd, not the process cwd", () => {
    withRepo((repoDir,) => {
      const root = runGit(["rev-parse", "--show-toplevel",], repoDir,);
      expect(realpathSync(root,),).toBe(realpathSync(repoDir,),);
    },);
  });

  test("ignores a hostile global config inherited from the host env", () => {
    withRepo((repoDir,) => {
      const hostile = join(repoDir, "hostile-gitconfig",);
      writeFileSync(hostile, "[lltest]\n\tmarker = hostile\n",);
      const previous = process.env.GIT_CONFIG_GLOBAL;
      process.env.GIT_CONFIG_GLOBAL = hostile;
      try {
        expect(runGit(["config", "--list",], repoDir,),).not.toContain("lltest.marker=hostile",);
      } finally {
        if (previous === undefined) { delete process.env.GIT_CONFIG_GLOBAL; }
        else { process.env.GIT_CONFIG_GLOBAL = previous; }
      }
    },);
  });
});
