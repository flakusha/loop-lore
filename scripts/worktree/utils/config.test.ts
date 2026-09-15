// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for linkWorktreeCredentials: root `.credentials.env` is symlinked
 * into fresh worktrees (parity between `new` and `create`), idempotently.
 */

import { describe, expect, it, } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { branchToPath, linkWorktreeCredentials, loadConfig, resolveBranch, } from "./config";

describe("linkWorktreeCredentials", () => {
  it("symlinks root credentials into the worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "ll-creds-root-",),);
    const wt = mkdtempSync(join(tmpdir(), "ll-creds-wt-",),);
    try {
      writeFileSync(join(root, ".credentials.env",), "AGENT_GPG_KEY_ID=test",);
      linkWorktreeCredentials(root, wt,);
      expect(readlinkSync(join(wt, ".credentials.env",),),).toBe(join(root, ".credentials.env",),);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
      rmSync(wt, { recursive: true, force: true, },);
    }
  });

  it("skips silently when root has no credentials file", () => {
    const root = mkdtempSync(join(tmpdir(), "ll-creds-noroot-",),);
    const wt = mkdtempSync(join(tmpdir(), "ll-creds-nowt-",),);
    try {
      linkWorktreeCredentials(root, wt,);
      expect(existsSync(join(wt, ".credentials.env",),),).toBe(false,);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
      rmSync(wt, { recursive: true, force: true, },);
    }
  });

  it("keeps an existing worktree credentials file", () => {
    const root = mkdtempSync(join(tmpdir(), "ll-creds-keep-root-",),);
    const wt = mkdtempSync(join(tmpdir(), "ll-creds-keep-wt-",),);
    try {
      writeFileSync(join(root, ".credentials.env",), "AGENT_GPG_KEY_ID=root",);
      const wtCreds = join(wt, ".credentials.env",);
      symlinkSync(join(root, ".credentials.env",), wtCreds,);
      linkWorktreeCredentials(root, wt,);
      expect(readlinkSync(wtCreds,),).toBe(join(root, ".credentials.env",),);
    } finally {
      rmSync(root, { recursive: true, force: true, },);
      rmSync(wt, { recursive: true, force: true, },);
    }
  });
});

/**
 * resolveBranch: scans every container registered in `worktreeDirs` (canonical
 * `tree/`, omp's `OMP_WORKTREE_DIR`, and any `EXTRA_TREE_DIRS`). Each dir is
 * expected to contain a worktree whose branch matches the input. A scratch
 * git repo (init + worktree add) stands in for a real repo.
 */
describe("resolveBranch", () => {
  let repo: string;
  let wtDirs: string[];
  const savedEnv: Record<string, string | undefined> = {};

  async function setup(): Promise<void> {
    repo = mkdtempSync(join(tmpdir(), "ll-resolve-repo-",),);
    wtDirs = [mkdtempSync(join(tmpdir(), "ll-resolve-tree-",),), mkdtempSync(join(tmpdir(), "ll-resolve-extra-",),),];
    for (const k of ["REPO_ROOT", "TREE_DIR", "OMP_WORKTREE_DIR", "EXTRA_TREE_DIRS",]) {
      savedEnv[k] = process.env[k];
    }
    process.env.REPO_ROOT = repo;
    delete process.env.TREE_DIR;
    delete process.env.OMP_WORKTREE_DIR;
    process.env.EXTRA_TREE_DIRS = wtDirs.join(":",);

    const init = Bun.spawnSync(["git", "init", "-q", "-b", "main", repo,], { stdout: "pipe", stderr: "pipe", },);
    expect(init.exitCode,).toBe(0,);
    Bun.spawnSync(["git", "-C", repo, "config", "user.email", "t@t",], { stdout: "pipe", stderr: "pipe", },);
    Bun.spawnSync(["git", "-C", repo, "config", "user.name", "t",], { stdout: "pipe", stderr: "pipe", },);
    Bun.spawnSync(["git", "-C", repo, "commit", "--allow-empty", "-m", "init", "-q",], {
      stdout: "pipe",
      stderr: "pipe",
    },);
  }

  async function makeWorktreeAt(container: string, branch: string,): Promise<string> {
    const dir = join(container, branchToPath(branch,),);
    const r = Bun.spawnSync(["git", "-C", repo, "worktree", "add", "-b", branch, dir, "main",], {
      stdout: "pipe",
      stderr: "pipe",
    },);
    expect(r.exitCode, `git worktree add failed: ${r.stderr.toString()}`,).toBe(0,);
    return dir;
  }

  function teardown(): void {
    for (const [k, v,] of Object.entries(savedEnv,)) {
      if (v === undefined) { delete process.env[k]; }
      else { process.env[k] = v; }
    }
    rmSync(repo, { recursive: true, force: true, },);
    for (const d of wtDirs) { rmSync(d, { recursive: true, force: true, },); }
  }

  it("finds a branch checked out under the first EXTRA_TREE_DIRS container", async () => {
    try {
      await setup();
      await makeWorktreeAt(wtDirs[0]!, "feat-extra-a",);
      const got = await resolveBranch(repo, "feat-extra-a",);
      expect(got,).toBe("feat-extra-a",);
    } finally {
      teardown();
    }
  });

  it("finds a branch checked out under the second EXTRA_TREE_DIRS container", async () => {
    try {
      await setup();
      await makeWorktreeAt(wtDirs[1]!, "feat-extra-b",);
      const got = await resolveBranch(repo, "feat-extra-b",);
      expect(got,).toBe("feat-extra-b",);
    } finally {
      teardown();
    }
  });

  it("returns the branch name unchanged when it exists in the repo", async () => {
    try {
      await setup();
      const r = Bun.spawnSync(["git", "-C", repo, "branch", "exists-only-as-ref",], {
        stdout: "pipe",
        stderr: "pipe",
      },);
      expect(r.exitCode,).toBe(0,);
      const got = await resolveBranch(repo, "exists-only-as-ref",);
      expect(got,).toBe("exists-only-as-ref",);
    } finally {
      teardown();
    }
  });

  it("returns empty string when the branch is unknown", async () => {
    try {
      await setup();
      const got = await resolveBranch(repo, "does-not-exist",);
      expect(got,).toBe("",);
    } finally {
      teardown();
    }
  });
});

/**
 * loadConfig.treeDir resolution: prefers the canonical `<repo>/tree` when it
 * exists, falls back to OMP_WORKTREE_DIR / EXTRA_TREE_DIRS only when canonical
 * is missing. OMP-only fresh repos gain a writable ledger location; legacy
 */
describe("loadConfig.treeDir", () => {
  let savedEnv: Record<string, string | undefined>;

  function setEnv(repo: string, opts: { treeExists?: boolean; ompExists?: boolean; extraDirs?: string[] } = {},): void {
    savedEnv = {
      REPO_ROOT: process.env.REPO_ROOT,
      TREE_DIR: process.env.TREE_DIR,
      OMP_WORKTREE_DIR: process.env.OMP_WORKTREE_DIR,
      EXTRA_TREE_DIRS: process.env.EXTRA_TREE_DIRS,
    };
    process.env.REPO_ROOT = repo;
    delete process.env.TREE_DIR;
    delete process.env.OMP_WORKTREE_DIR;
    delete process.env.EXTRA_TREE_DIRS;
    if (opts.extraDirs) { process.env.EXTRA_TREE_DIRS = opts.extraDirs.join(":",); }
    if (opts.ompExists) {
      const p = mkdtempSync(join(tmpdir(), "ll-loadcfg-omp-",),);
      process.env.OMP_WORKTREE_DIR = p;
    }
    if (opts.treeExists) { mkdirSync(join(repo, "tree",), { recursive: true, },); }
  }

  function restoreEnv(): void {
    for (const [k, v,] of Object.entries(savedEnv,)) {
      if (v === undefined) { delete process.env[k]; }
      else { process.env[k] = v; }
    }
  }

  it("uses <repo>/tree when canonical exists (legacy invariant)", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ll-loadcfg-legacy-",),);
    try {
      setEnv(repo, { treeExists: true, },);
      const c = await loadConfig();
      expect(c.treeDir,).toBe(join(repo, "tree",),);
    } finally {
      restoreEnv();
      rmSync(repo, { recursive: true, force: true, },);
    }
  });

  it("canonical wins over OMP when both exist (legacy invariant)", async () => {
    // Regression: a repo with `<repo>/tree` AND `OMP_WORKTREE_DIR` exported
    // (e.g. by an unrelated tool) must still anchor its ledger at canonical;
    // stealing `treeDir` for OMP would lose `.ledger.jsonl` continuity.
    const repo = mkdtempSync(join(tmpdir(), "ll-loadcfg-canonical-vs-omp-",),);
    try {
      setEnv(repo, { treeExists: true, ompExists: true, },);
      const c = await loadConfig();
      expect(c.treeDir,).toBe(join(repo, "tree",),);
      // OMP still appears in worktreeDirs so resolveBranch can find branches
      // there; it's just not the primary treeDir.
      expect(c.worktreeDirs,).toContain(process.env.OMP_WORKTREE_DIR!,);
    } finally {
      restoreEnv();
      rmSync(repo, { recursive: true, force: true, },);
    }
  });

  it("falls back to OMP_WORKTREE_DIR when canonical is missing", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ll-loadcfg-omponly-",),);
    try {
      setEnv(repo, { ompExists: true, },);
      const ompDir = process.env.OMP_WORKTREE_DIR!;
      const c = await loadConfig();
      expect(c.treeDir,).toBe(ompDir,);
      expect(c.treeDir,).not.toBe(join(repo, "tree",),); // canonical doesn't exist
    } finally {
      restoreEnv();
      rmSync(repo, { recursive: true, force: true, },);
    }
  });

  it("honors TREE_DIR override even when canonical exists (CI escape hatch)", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ll-loadcfg-override-",),);
    const overrideDir = mkdtempSync(join(tmpdir(), "ll-loadcfg-override-target-",),);
    try {
      setEnv(repo, { treeExists: true, },);
      process.env.TREE_DIR = overrideDir;
      const c = await loadConfig();
      expect(c.treeDir,).toBe(overrideDir,);
    } finally {
      restoreEnv();
      rmSync(repo, { recursive: true, force: true, },);
      rmSync(overrideDir, { recursive: true, force: true, },);
    }
  });

  it("worktreeDirs ordering matches treeDir priority (TREE_DIR > OMP > extras > canonical)", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ll-loadcfg-order-",),);
    const overrideDir = mkdtempSync(join(tmpdir(), "ll-loadcfg-order-override-",),);
    try {
      setEnv(repo, { treeExists: true, ompExists: true, },);
      process.env.TREE_DIR = overrideDir;
      const ompDir = process.env.OMP_WORKTREE_DIR!;
      const c = await loadConfig();
      expect(c.treeDir,).toBe(overrideDir,);
      expect(c.worktreeDirs[0],).toBe(overrideDir,);
      // OMP second, canonical last
      expect(c.worktreeDirs,).toContain(ompDir,);
      expect(c.worktreeDirs[c.worktreeDirs.length - 1],).toBe(join(repo, "tree",),);
      // No duplicates
      expect(new Set(c.worktreeDirs,).size,).toBe(c.worktreeDirs.length,);
    } finally {
      restoreEnv();
      rmSync(repo, { recursive: true, force: true, },);
      rmSync(overrideDir, { recursive: true, force: true, },);
    }
  });
  it("falls back to canonical when neither canonical nor OMP exists", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ll-loadcfg-empty-",),);
    try {
      setEnv(repo,);
      const c = await loadConfig();
      // Even when missing, treeDir is reported as canonical so callers see a
      // stable contract; appendLedger skips writes to missing dirs.
      expect(c.treeDir,).toBe(join(repo, "tree",),);
    } finally {
      restoreEnv();
      rmSync(repo, { recursive: true, force: true, },);
    }
  });
});
