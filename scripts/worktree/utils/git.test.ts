// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * `isolatedGitEnv()` — the child-git env filter.
 *
 * The regression: `gitSync` ran git with a bare spawn, so every GIT_*
 * hook-scoped var (GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE, ...) was inherited
 * verbatim and could redirect what the child operated on despite the explicit
 * `-C <repoRoot>`. The OMP_/PI_/ENGRAM_/MNEMO_ agent-harness session vars
 * leaked the same way.
 *
 * Resource contract: each test owns a private `mkdtemp` repo, removed in the
 * shared `afterEach`. No test writes to `process.env` — a hostile `GIT_*` is
 * threaded in as an explicit source object, so these run in any order and in
 * parallel with any other file.
 */

import { afterEach, describe, expect, it, } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { gitSync, gitSyncQuiet, isolatedGitEnv, } from "./git";

const STRIPPED_PREFIXES = ["GIT_", "OMP_", "PI_", "ENGRAM_", "MNEMO_",];
const temps: string[] = [];

/**
 * Init a throwaway repo with one commit on `main`; returns its root.
 *
 * The committed tree stays EMPTY, because a child that inherits a seeded
 * GIT_INDEX_FILE reads it as an empty index - that only matches an empty
 * HEAD tree (reporting 0) and differs from the real, staged one (reporting
 * 1). A file in the tree would collapse that contrast.
 *
 * `seed` is the commit message, so two repos built with different seeds
 * always have different HEADs - a comparison between them must not be able
 * to skip itself on a same-second empty commit.
 */
function makeRepo(seed = "base",): string {
  const root = mkdtempSync(join(tmpdir(), "loop-lore-isolated-env-",),);
  temps.push(root,);
  const git = (args: string[],): void => {
    // Isolated like the code under test: an ambient GIT_* on the runner's
    // env would otherwise redirect these fixture commands too, which is the
    // same class of bug the fixture is meant to stay clear of.
    const r = Bun.spawnSync(["git", "-C", root, ...args,], {
      stdout: "pipe",
      stderr: "pipe",
      env: isolatedGitEnv(),
    },);
    if (r.exitCode !== 0) { throw new Error(r.stderr.toString().trim(),); }
  };
  git(["init", "-q", "-b", "main", ".",],);
  git(["config", "user.email", "isolated-env@localhost",],);
  git(["config", "user.name", "isolated env",],);
  git(["commit", "--allow-empty", "-qm", seed,],);
  // A staged-but-uncommitted file, so the real index is non-empty and a
  // comparison against it is distinguishable from one against an empty one.
  writeFileSync(join(root, "staged.txt",), "staged\n",);
  git(["add", "staged.txt",],);
  return root;
}

/** Run a child git with an explicit env (the pre-fix shape used process.env). */
function childGit(repoRoot: string, env: Record<string, string>, args: string[],): number {
  return Bun.spawnSync(["git", "-C", repoRoot, ...args,], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  },).exitCode;
}

/** Same child, but reporting stdout - the only way to tell WHICH repo a
 * ref resolved against, since `rev-parse` exits 0 in both. */
function childGitOut(repoRoot: string, env: Record<string, string>, args: string[],): string {
  return Bun.spawnSync(["git", "-C", repoRoot, ...args,], {
    stdout: "pipe",
    stderr: "pipe",
    env,
  },).stdout.toString().trim();
}

/**
 * A child env that still carries `key`, built without touching the shared
 * `process.env` and without inheriting an ambient `GIT_*` that would compete
 * with it. The var is added AFTER filtering, so it survives - which is the
 * point: it models the pre-fix child, deterministically, whatever the runner's
 * own environment happens to hold.
 */
function hostileEnv(key: string, value: string,): NodeJS.ProcessEnv {
  return { ...isolatedGitEnv(), [key]: value, };
}

afterEach(() => {
  for (const root of temps.splice(0,)) { rmSync(root, { recursive: true, force: true, },); }
},);

describe("isolatedGitEnv", () => {
  it("strips the GIT_ and harness session prefixes", () => {
    // A fixed source, so the assertion does not depend on what the ambient
    // runner env happens to carry.
    const env = isolatedGitEnv({
      PATH: "/usr/bin",
      HOME: "/home/tester",
      GIT_INDEX_FILE: "/tmp/seeded.index",
      GIT_DIR: "/tmp/elsewhere/.git",
      OMP_PROFILE: "minimax",
      PI_PROFILE: "minimax",
      ENGRAM_PROJECT: "loop-lore",
      MNEMO_SCOPE: "session",
    },);
    const leaked = Object.keys(env,).filter((k,) => STRIPPED_PREFIXES.some((p,) => k.startsWith(p,)));
    expect(leaked,).toEqual([],);
  });

  it("keeps the vars a child git needs to run at all", () => {
    const env = isolatedGitEnv({ PATH: "/usr/bin", HOME: "/home/tester", GIT_DIR: "/tmp/x", },);
    expect(env.PATH,).toBe("/usr/bin",);
    expect(env.HOME,).toBe("/home/tester",);
  });

  it("resolves the child against repoRoot, not a seeded GIT_INDEX_FILE", () => {
    const root = makeRepo();
    const seeded = hostileEnv("GIT_INDEX_FILE", join(root, "seeded.index",),);
    // `git diff --cached --quiet` exits 1 when the index holds staged changes.
    // The repo stages one file, so the isolated child reports 1. A child that
    // inherits the seeded index compares against an empty one and reports 0 - a
    // false "worktree is clean" that lets finalize proceed over staged work it
    // never saw.
    expect(childGit(root, isolatedGitEnv(seeded,), ["diff", "--cached", "--quiet",],),).toBe(1,);
    expect(childGit(root, seeded, ["diff", "--cached", "--quiet",],),).toBe(0,);
  });

  it("resolves refs against repoRoot even with GIT_DIR seeded elsewhere", () => {
    const root = makeRepo("repo-root",);
    const other = makeRepo("other-repo",);
    const head = gitSync(root, "rev-parse", "HEAD",);
    const otherHead = gitSync(other, "rev-parse", "HEAD",);
    // Distinct seeds, so this guard can never silently skip the real check.
    expect(otherHead,).not.toBe(head,);
    const seeded = hostileEnv("GIT_DIR", join(other, ".git",),);
    // `rev-parse HEAD` exits 0 in both repos, so the resolved SHA is the
    // discriminator: an inheriting child answers from `other` despite
    // `-C root`, the isolated one from `root`.
    expect(childGitOut(root, seeded, ["rev-parse", "HEAD",],),).toBe(otherHead,);
    expect(childGitOut(root, isolatedGitEnv(seeded,), ["rev-parse", "HEAD",],),).toBe(head,);
    expect(gitSyncQuiet(root, "rev-parse", "HEAD",),).toBe(head,);
  });
});
