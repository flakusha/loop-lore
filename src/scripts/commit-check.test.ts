// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression guard for the tagless-repo case in `getCommitsSinceLastTag`.
 *
 * The pre-fix line was `git describe --tags --abbrev=0 2>/dev/null || echo ''`,
 * whose `|| echo ''` forced exit 0. After the argv-array rewrite the call went
 * through `runGit`, which THROWS on non-zero exit, and the surrounding `catch`
 * turned that into `return []` — so on a repo with no tags (fresh clone without
 * tags, `--depth 1` shallow clone, never-tagged repo) validation checked nothing
 * and passed vacuously.
 *
 * Resource contract: each test owns a private `mkdtemp` git repo and removes it
 * in `finally`. Nothing is shared and no fixed path is reused, so these are safe
 * under any runner parallelism and in any order.
 *
 * Identity contract: commits are built with `git hash-object -t commit -w`,
 * writing the commit object byte-for-byte. Git is never asked to resolve an
 * identity, so this needs no `user.name`/`user.email`, no global config, and no
 * `GIT_AUTHOR_*`/`GIT_COMMITTER_*` environment overrides. Nothing is ever
 * written to git config.
 */

import { describe, expect, test, } from "bun:test";
import { execFileSync, } from "node:child_process";
import { mkdtempSync, rmSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const SCRIPT = join(import.meta.dir, "commit-check.ts",);

/**
 * @param cwd - directory to run git in
 * @param args - git argv; passed as an array, never through a shell
 * @param stdin - optional stdin payload
 * @returns trimmed stdout
 */
function git(cwd: string, args: string[], stdin?: string,): string {
  return execFileSync("git", args, {
    cwd,
    stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe",],
    encoding: "utf8",
    input: stdin,
  },).trim();
}

/**
 * A repo with a single blob and the tree sha, so a commit can be written against
 * it. No commit is created here, so no identity is needed.
 * @param dir - repo directory
 * @returns the tree sha
 */
function initRepo(dir: string,): string {
  git(dir, ["init", "-q", "-b", "main",],);
  const blob = git(dir, ["hash-object", "-w", "--stdin",], "hello\n",);
  return git(dir, ["mktree",], `100644 blob ${blob}\tfile.txt\n`,);
}

/**
 * Write one commit object and point `main` at it. The commit text is assembled
 * here and handed to git verbatim, so there is no identity for git to resolve.
 * @param dir - repo directory
 * @param tree - tree sha from {@link initRepo}
 * @param parent - parent commit sha, or "" for the root commit
 * @param message - commit subject line
 * @returns the new commit sha
 */
function writeCommit(dir: string, tree: string, parent: string, message: string,): string {
  const header = [
    `tree ${tree}`,
    ...(parent ? [`parent ${parent}`,] : []),
    "author Test <test@example.invalid> 1700000000 +0000",
    "committer Test <test@example.invalid> 1700000000 +0000",
    "",
    `${message}\n`,
  ].join("\n",);

  const sha = git(dir, ["hash-object", "-t", "commit", "-w", "--stdin",], header,);
  git(dir, ["update-ref", "refs/heads/main", sha,],);
  return sha;
}

describe("commit-check commit collection", () => {
  test("a tagless repo still validates every commit", () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-lore-nolasttag-",),);
    try {
      const tree = initRepo(dir,);
      const first = writeCommit(dir, tree, "", "feat: first",);
      // Invalid on purpose: a check that collects nothing exits 0 and prints
      // "No commits to validate", so this is what proves the list is non-empty.
      writeCommit(dir, tree, first, "this is not a conventional commit",);

      expect(git(dir, ["tag",],),).toBe("",);
      // Precondition: this really is the case that regressed.
      expect(() => git(dir, ["describe", "--tags", "--abbrev=0",],)).toThrow();
      expect(git(dir, ["rev-list", "--count", "HEAD",],),).toBe("2",);

      const proc = Bun.spawnSync(["bun", SCRIPT, "--all",], { cwd: dir, stdout: "pipe", stderr: "pipe", },);
      const out = proc.stdout.toString();

      expect(out,).not.toContain("No commits to validate",);
      expect(out,).toContain("this is not a conventional commit",);
      expect(proc.exitCode,).toBe(1,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  }, 30_000,);

  test("a tagged repo validates only the commits after the tag", () => {
    const dir = mkdtempSync(join(tmpdir(), "loop-lore-lasttag-",),);
    try {
      const tree = initRepo(dir,);
      // Invalid subject, but it sits AT the tag so it is out of range.
      const first = writeCommit(dir, tree, "", "garbage before the tag",);
      git(dir, ["tag", "v1.0.0", first,],);
      writeCommit(dir, tree, first, "fix: after the tag",);

      const proc = Bun.spawnSync(["bun", SCRIPT, "--all",], { cwd: dir, stdout: "pipe", stderr: "pipe", },);
      const out = proc.stdout.toString();

      expect(out,).not.toContain("garbage before the tag",);
      expect(out,).toContain("1 commits valid",);
      expect(proc.exitCode,).toBe(0,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  }, 30_000,);
});
