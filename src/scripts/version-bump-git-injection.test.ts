// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Resource contract: each test owns a private `mkdtemp` git repo and removes it
// in `finally`. Nothing is shared, no fixed path is reused, and the child
// process runs with `cwd` set to that repo, so these are safe under any runner
// parallelism and in any order.

import { describe, expect, test, } from "bun:test";
import { execFileSync, } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const SCRIPT = join(import.meta.dir, "version-bump.ts",);

/**
 * @param cwd - directory to run git in
 * @param args - git argv; passed as an array, never through a shell
 */
function git(cwd: string, args: string[],): void {
  execFileSync("git", args, { cwd, stdio: "ignore", },);
}

/**
 * Create a throwaway repo whose only tag points at a raw blob.
 *
 * No commit is made, so no commit identity is needed and nothing writes git
 * config — persistent config is the repo owner's business, never a test's.
 * `git hash-object -w` plus `update-ref` is the plumbing path to a real,
 * listable tag without ever authoring a commit.
 * @param tag - tag name to create
 * @returns the repo directory
 */
function repoWithTag(tag: string,): string {
  const dir = mkdtempSync(join(tmpdir(), "loop-lore-gitinject-",),);
  git(dir, ["init", "-q", "-b", "master",],);
  writeFileSync(join(dir, "blob",), "x\n",);
  const sha = execFileSync("git", ["hash-object", "-w", "blob",], {
    cwd: dir,
    encoding: "utf8",
  },).trim();

  git(dir, ["update-ref", `refs/tags/${tag}`, sha,],);
  return dir;
}

describe("version-bump git invocation", () => {
  test("a shell payload in a tag name is never executed", () => {
    // `$(id>./INJECTED)` is space-free on purpose: git rejects a ref name with a
    // space, but this is a legal tag name AND a legal shell command. The pre-fix
    // code interpolated it into an `execSync` string, so the shell ran it. It
    // rides in the PRERELEASE slot because a bare `1.0.0<payload>` is dropped by
    // the `x.y.z[-+].*` filter before ever reaching the git call.
    const dir = repoWithTag("1.0.0-$(id>./INJECTED)",);
    const marker = join(dir, "INJECTED",);
    try {
      // `predict` is the default read-only action; it calls getLatestTag and
      // getCommitsSinceTag, which is where the tag name used to reach a shell.
      const proc = Bun.spawnSync(["bun", SCRIPT,], { cwd: dir, stdout: "pipe", stderr: "pipe", },);

      expect(existsSync(marker,),).toBe(false,);
      // The run must still have happened, or the assertion above proves nothing.
      expect(proc.exitCode,).toBe(0,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  }, 30_000,);

  test("a benign x.y.z tag is still read as the current version", () => {
    const dir = repoWithTag("1.2.3",);
    try {
      const proc = Bun.spawnSync(["bun", SCRIPT,], { cwd: dir, stdout: "pipe", stderr: "pipe", },);

      expect(proc.exitCode,).toBe(0,);
      // The in-process tag filter/sort must still resolve the real latest tag.
      // With no commits after 1.2.3, predict stays at that version.
      expect(proc.stdout.toString().trim(),).toBe("1.2.3",);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  }, 30_000,);
});
