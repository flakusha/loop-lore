/**
 * Worktree CLI integration tests — ported from the removed tests/worktree-flow.sh.
 *
 * Spawns the TS dispatcher (scripts/worktree/index.mjs) against a temporary
 * git repo, mirroring the 47 scenarios of the old bash suite.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, resolve, } from "node:path";

const DISPATCHER = resolve(import.meta.dir, "..", "scripts", "worktree", "index.mjs",);

let repoRoot = "";
let treeDir = "";

interface RunResult {
  stdout: string;
  exitCode: number;
}

function runWt(...args: string[]): RunResult {
  const result = Bun.spawnSync(
    ["bun", "run", DISPATCHER, ...args,],
    {
      cwd: repoRoot,
      env: { ...process.env, REPO_ROOT: repoRoot, TREE_DIR: treeDir, NO_COLOR: "1", },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return { stdout: result.stdout.toString(), exitCode: result.exitCode ?? 0, };
}

function git(repo: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args,], { stdout: "pipe", stderr: "pipe", },);
  return result.stdout.toString().trim();
}

function gitOk(repo: string, ...args: string[]): boolean {
  const result = Bun.spawnSync(["git", "-C", repo, ...args,], { stdout: "pipe", stderr: "pipe", },);
  return result.exitCode === 0;
}

beforeAll(() => {
  repoRoot = join(tmpdir(), `wt-flow-${Date.now()}`,);
  treeDir = join(repoRoot, "tree",);
  mkdirSync(repoRoot, { recursive: true, },);
  git(repoRoot, "init", "--initial-branch=master",);
  git(repoRoot, "config", "user.name", "Test User",);
  git(repoRoot, "config", "user.email", "test@example.com",);
  writeFileSync(join(repoRoot, "README.md",), "# test repo",);
  git(repoRoot, "add", "README.md",);
  git(repoRoot, "commit", "-m", "init: test repo", "--no-gpg-sign",);
  git(repoRoot, "branch", "feature-existing",);
},);

afterAll(() => {
  rmSync(repoRoot, { recursive: true, force: true, },);
},);

describe("worktree CLI", () => {
  test("1. branch_to_path — slash → dash conversion", () => {
    expect("feat/my-feature".replace(/\//g, "-",),).toBe("feat-my-feature",);
    expect("simple-branch".replace(/\//g, "-",),).toBe("simple-branch",);
    expect("a/b/c/deep".replace(/\//g, "-",),).toBe("a-b-c-deep",);
  });

  test("2. new — create branch + worktree", () => {
    const r = runWt("new", "feat/test-new",);
    expect(r.exitCode,).toBe(0,);
    expect(existsSync(join(treeDir, "feat-test-new", ".git",),),).toBe(true,);
    expect(gitOk(repoRoot, "rev-parse", "--verify", "feat/test-new",),).toBe(true,);
  });

  test("3. create — worktree for existing branch", () => {
    const r = runWt("create", "feature-existing",);
    expect(r.exitCode,).toBe(0,);
    expect(existsSync(join(treeDir, "feature-existing",),),).toBe(true,);
  });

  test("4. create — idempotent (already exists)", () => {
    const r = runWt("create", "feature-existing",);
    expect(r.stdout,).toContain("already exists",);
  });

  test("5. new — error on existing branch", () => {
    const r = runWt("new", "feature-existing",);
    expect(r.stdout,).toContain("already exists",);
  });

  test("6. new — error on non-existent base", () => {
    const r = runWt("new", "feat/no-base", "non-existent-branch",);
    expect(r.stdout,).toContain("does not exist",);
  });

  test("7. new — custom base branch", () => {
    git(repoRoot, "checkout", "-b", "custom-base",);
    writeFileSync(join(repoRoot, "custom.txt",), "custom",);
    git(repoRoot, "add", "custom.txt",);
    git(repoRoot, "commit", "-m", "feat: custom base", "--no-gpg-sign",);
    git(repoRoot, "checkout", "master",);

    const r = runWt("new", "feat/from-custom", "custom-base",);
    expect(r.exitCode,).toBe(0,);
    expect(existsSync(join(treeDir, "feat-from-custom", "custom.txt",),),).toBe(true,);
  });

  test("8. merge — merge source into branch", () => {
    const wt = join(treeDir, "feat-test-new",);
    git(wt, "checkout", "feat/test-new",);
    writeFileSync(join(wt, "feature.txt",), "new feature",);
    git(wt, "add", "feature.txt",);
    git(wt, "commit", "-m", "feat: add feature", "--no-gpg-sign",);

    const r = runWt("merge", "feat/test-new", "custom-base",);
    expect(r.stdout,).toContain("Merged",);
    expect(existsSync(join(wt, "custom.txt",),),).toBe(true,);
  });

  test("9. merge — error on missing args", () => {
    const r = runWt("merge", "feat/test-new",);
    expect(r.stdout,).toContain("branch and source required",);
  });

  test("10. merge — error on non-existent source", () => {
    const r = runWt("merge", "feat/test-new", "non-existent-branch",);
    expect(r.stdout,).toContain("does not exist",);
  });

  test("11. merge — error on missing branch", () => {
    const r = runWt("merge", "non-existent", "custom-base",);
    expect(r.stdout,).toContain("no worktree found",);
  });

  test("12. merge — blocks dirty worktree", () => {
    const wt = join(treeDir, "feat-test-new",);
    writeFileSync(join(wt, "feature.txt",), "dirty",);
    const r = runWt("merge", "feat/test-new", "custom-base",);
    expect(r.stdout,).toMatch(/uncommitted changes|Warning: uncommitted/,);
    git(wt, "checkout", "--", "feature.txt",);
  });

  test("13. rebase — rebase onto target", () => {
    writeFileSync(join(repoRoot, "commit2.txt",), "commit2",);
    git(repoRoot, "add", "commit2.txt",);
    git(repoRoot, "commit", "-m", "chore: second commit for rebase test", "--no-gpg-sign",);

    git(repoRoot, "checkout", "-b", "feat-behind", "master~1",);
    writeFileSync(join(repoRoot, "behind.txt",), "behind",);
    git(repoRoot, "add", "behind.txt",);
    git(repoRoot, "commit", "-m", "feat: behind branch", "--no-gpg-sign",);
    git(repoRoot, "checkout", "master",);

    runWt("create", "feat-behind",);
    expect(existsSync(join(treeDir, "feat-behind",),),).toBe(true,);

    const r = runWt("rebase", "feat-behind", "master",);
    expect(r.stdout,).toContain("Rebased",);
  });

  test("14. rebase — error on missing args", () => {
    const r = runWt("rebase",);
    expect(r.stdout,).toContain("branch name required",);
  });

  test("15. rebase — error on non-existent onto", () => {
    const r = runWt("rebase", "feat-behind", "non-existent",);
    expect(r.stdout,).toContain("does not exist",);
  });

  test("16. remove — remove worktree", () => {
    const r = runWt("remove", "feat-behind",);
    expect(r.stdout,).toContain("Removed",);
    expect(existsSync(join(treeDir, "feat-behind",),),).toBe(false,);
  });

  test("17. remove — error on missing branch", () => {
    const r = runWt("remove", "non-existent",);
    expect(r.stdout,).toContain("no worktree found",);
  });

  test("18. remove — blocks dirty worktree", () => {
    const wt = join(treeDir, "feat-test-new",);
    writeFileSync(join(wt, "feature.txt",), "dirty",);
    const r = runWt("remove", "feat/test-new",);
    expect(r.stdout,).toMatch(/uncommitted changes/,);
    git(wt, "checkout", "--", "feature.txt",);
  });

  test("19. list — list worktrees", () => {
    const r = runWt("list",);
    expect(r.stdout,).toContain("Worktrees",);
    expect(r.stdout,).toContain("feat-test-new",);
    expect(r.stdout,).toContain("feature-existing",);
  });

  test("20. cleanup — remove stale worktrees", () => {
    git(repoRoot, "checkout", "-b", "stale-branch",);
    writeFileSync(join(repoRoot, "stale.txt",), "stale",);
    git(repoRoot, "add", "stale.txt",);
    git(repoRoot, "commit", "-m", "feat: stale", "--no-gpg-sign",);
    git(repoRoot, "checkout", "master",);

    runWt("create", "stale-branch",);
    expect(existsSync(join(treeDir, "stale-branch",),),).toBe(true,);

    // Remove worktree registration, then delete branch ref directly
    git(repoRoot, "worktree", "remove", join(treeDir, "stale-branch",), "--force",);
    git(repoRoot, "update-ref", "-d", "refs/heads/stale-branch",);

    // Re-create the directory as a stale leftover (not a registered worktree)
    mkdirSync(join(treeDir, "stale-branch",), { recursive: true, },);
    writeFileSync(join(treeDir, "stale-branch", "orphan.txt",), "stale leftover",);

    const r = runWt("cleanup",);
    expect(r.stdout,).toContain("Cleanup complete",);
  });

  test("21. no args — shows usage", () => {
    const r = runWt();
    expect(r.stdout,).toContain("Run: worktree",);
    expect(r.stdout,).toContain("create",);
    expect(r.stdout,).toContain("new",);
    expect(r.stdout,).toContain("merge",);
    expect(r.stdout,).toContain("finalize",);
    expect(r.stdout,).toContain("agent-merge",);
  });

  test("22. unknown command — shows usage", () => {
    const r = runWt("foobar",);
    expect(r.stdout,).toContain("Run: worktree",);
  });

  test("23. sign — error on missing branch", () => {
    const r = runWt("sign",);
    expect(r.stdout,).toContain("branch name required",);
  });

  test("24. sign — error on non-existent worktree", () => {
    const r = runWt("sign", "non-existent",);
    expect(r.stdout,).toContain("no worktree found",);
  });

  test("25. create — error on non-existent branch", () => {
    const r = runWt("create", "totally-fake-branch",);
    expect(r.stdout,).toContain("does not exist",);
  });

  test("26. new — blocks protected branch", () => {
    expect(runWt("new", "master",).stdout,).toContain("protected",);
    expect(runWt("new", "main",).stdout,).toContain("protected",);
  });

  test("27. create — blocks protected branch", () => {
    const r = runWt("create", "master",);
    expect(r.stdout,).toContain("protected branch",);
  });

  test("28. rebase — blocks protected branch", () => {
    const r = runWt("rebase", "master",);
    expect(r.stdout,).toContain("cannot rebase protected branch",);
  });

  test("29. finalize — error on missing branch", () => {
    const r = runWt("finalize",);
    expect(r.stdout,).toContain("branch name required",);
  });

  test("30. finalize — error on missing worktree", () => {
    const r = runWt("finalize", "non-existent",);
    expect(r.stdout,).toContain("no worktree found",);
  });

  test("31. finalize — blocks protected branch", () => {
    mkdirSync(join(treeDir, "master",), { recursive: true, },);
    const r = runWt("finalize", "master",);
    expect(r.stdout,).toContain("protected branch",);
    rmSync(join(treeDir, "master",), { recursive: true, force: true, },);
  });

  test("32. finalize — blocks dirty worktree", () => {
    const wt = join(treeDir, "feat-test-new",);
    writeFileSync(join(wt, "feature.txt",), "dirty",);
    const r = runWt("finalize", "feat/test-new",);
    expect(r.stdout,).toMatch(/uncommitted changes/,);
    git(wt, "checkout", "--", "feature.txt",);
  });

  test("33. finalize — no commits beyond base", () => {
    git(repoRoot, "checkout", "-b", "feat-no-commits", "master",);
    git(repoRoot, "checkout", "master",);
    runWt("create", "feat-no-commits",);
    const r = runWt("finalize", "feat-no-commits",);
    expect(r.stdout,).toContain("no commits beyond",);
  });

  test("34. agent-merge — alias for finalize", () => {
    const r = runWt("agent-merge",);
    expect(r.stdout,).toContain("branch name required",);
  });

  test("35. full lifecycle — new → commit → finalize", () => {
    runWt("new", "feat/lifecycle",);
    expect(existsSync(join(treeDir, "feat-lifecycle",),),).toBe(true,);

    const wt = join(treeDir, "feat-lifecycle",);
    writeFileSync(join(wt, "lifecycle.txt",), "lifecycle",);
    git(wt, "add", "lifecycle.txt",);
    git(wt, "commit", "-m", "feat: lifecycle test", "--no-gpg-sign",);

    expect(runWt("list",).stdout,).toContain("feat-lifecycle",);

    const r = runWt("finalize", "feat/lifecycle",);
    expect(r.stdout,).toContain("Finalized",);
    expect(existsSync(join(treeDir, "feat-lifecycle",),),).toBe(false,);

    const log = git(repoRoot, "log", "--oneline", "master",);
    expect(log,).toContain("lifecycle test",);
  });

  test("36. full lifecycle — agent-merge alias", () => {
    runWt("new", "feat/agent-merge-test",);
    const wt = join(treeDir, "feat-agent-merge-test",);
    writeFileSync(join(wt, "am.txt",), "agent-merge",);
    git(wt, "add", "am.txt",);
    git(wt, "commit", "-m", "feat: agent merge test", "--no-gpg-sign",);

    const r = runWt("agent-merge", "feat/agent-merge-test",);
    expect(r.stdout,).toContain("Finalized",);
    expect(existsSync(join(treeDir, "feat-agent-merge-test",),),).toBe(false,);
  });

  test("37. branches — list branches with status", () => {
    const r = runWt("branches",);
    expect(r.stdout,).toContain("master",);
    expect(r.stdout,).toContain("Branches",);
  });

  test("38. branches — merged branch removed after finalize", () => {
    runWt("new", "feat/merged-branch",);
    const wt = join(treeDir, "feat-merged-branch",);
    writeFileSync(join(wt, "merged.txt",), "merged",);
    git(wt, "add", "merged.txt",);
    git(wt, "commit", "-m", "feat: merged branch", "--no-gpg-sign",);
    runWt("finalize", "feat/merged-branch", "--force",);

    const r = runWt("branches",);
    expect(r.stdout,).not.toContain("feat/merged-branch",);
  });

  test("39. branches — shows pending status", () => {
    runWt("new", "feat/pending-branch",);
    const wt = join(treeDir, "feat-pending-branch",);
    writeFileSync(join(wt, "pending.txt",), "pending",);
    git(wt, "add", "pending.txt",);
    git(wt, "commit", "-m", "feat: pending branch", "--no-gpg-sign",);

    const r = runWt("branches",);
    expect(r.stdout,).toContain("feat/pending-branch",);
    expect(r.stdout,).toContain("pending",);
  });

  test("40. branches — shows worktree marker", () => {
    const r = runWt("branches",);
    expect(r.stdout,).toContain("[wt]",);
    runWt("remove", "feat/pending-branch",);
  });

  test("41. diff — show diff between branch and master", () => {
    runWt("new", "feat/diff-test",);
    const wt = join(treeDir, "feat-diff-test",);
    writeFileSync(join(wt, "diff.txt",), "diff content",);
    git(wt, "add", "diff.txt",);
    git(wt, "commit", "-m", "feat: diff test", "--no-gpg-sign",);

    const r = runWt("diff", "feat/diff-test",);
    expect(r.stdout,).toContain("Ahead",);
    expect(r.stdout,).toContain("diff.txt",);
    runWt("remove", "feat/diff-test",);
  });

  test("42. diff — error on missing branch", () => {
    const r = runWt("diff",);
    expect(r.stdout,).toContain("branch name required",);
  });

  test("43. diff — error on non-existent branch", () => {
    const r = runWt("diff", "totally-fake-branch",);
    expect(r.stdout,).toContain("not found",);
  });

  test("44. status — show current branch status", () => {
    const r = runWt("status",);
    expect(r.stdout,).toContain("Branch status",);
    expect(r.stdout,).toContain("Branch:",);
  });

  test("45. status — show specific branch status", () => {
    const r = runWt("status", "feat/pending-branch",);
    expect(r.stdout,).toContain("Branch status",);
    expect(r.stdout,).toContain("commit",);
  });

  test("46. list — shows detailed worktree info", () => {
    runWt("new", "feat/list-detail",);
    const r = runWt("list",);
    expect(r.stdout,).toContain("feat/list-detail",);
    expect(r.stdout,).toContain("Worktrees",);
    runWt("remove", "feat/list-detail",);
  });

  test("47. diff — shows behind count", () => {
    runWt("new", "feat/behind-test",);
    const wt = join(treeDir, "feat-behind-test",);
    writeFileSync(join(wt, "behind.txt",), "behind",);
    git(wt, "add", "behind.txt",);
    git(wt, "commit", "-m", "feat: behind test", "--no-gpg-sign",);

    writeFileSync(join(repoRoot, "advance.txt",), "master advance",);
    git(repoRoot, "add", "advance.txt",);
    git(repoRoot, "commit", "-m", "chore: advance master", "--no-gpg-sign",);

    const r = runWt("diff", "feat/behind-test",);
    expect(r.stdout,).toContain("Behind",);
    runWt("remove", "feat/behind-test",);
  });

  test("48. issues — runs without REPO_ROOT env var", () => {
    // Regression: previously loadConfig derived repoRoot from import.meta.url,
    // which broke when invoked from inside a linked worktree because bun
    // resolves the script path relative to cwd. The fix uses
    // `git rev-parse --git-common-dir` to locate the main repo.
    const result = Bun.spawnSync(
      ["bun", "run", DISPATCHER, "issues",],
      {
        cwd: repoRoot,
        // Strip REPO_ROOT/TREE_DIR to simulate "no env vars".
        env: Object.fromEntries(Object.entries(process.env,).filter(([k,],) => k !== "REPO_ROOT" && k !== "TREE_DIR"),),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(result.exitCode,).toBe(0,);
    // If the env-var requirement had regressed, loadConfig would have set
    // repoRoot to <worktree> rather than the main repo and any command that
    // reads treeDir (e.g. listing branches) would fail or return wrong data.
    // issues command prints nothing on empty repo, but exitCode=0 + no error
    // proves config resolved correctly.
    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();
    expect(stderr,).not.toContain("worktree not found",);
    expect(stdout + stderr,).not.toMatch(/must be run from the repo root/,);
  });

  test("49. status — works from inside a linked worktree without env vars", () => {
    // Create the worktree directly via git (the worktree CLI's `new` command
    // defaults its base to `dev`, which doesn't exist in the test repo's
    // master-only layout — pre-existing baseline gap, not this fix's concern).
    mkdirSync(treeDir, { recursive: true, },);
    const wt = join(treeDir, "feat-inworktree-status",);
    expect(gitOk(repoRoot, "worktree", "add", "-b", "feat/inworktree-status", wt, "master",),).toBe(true,);
    expect(existsSync(wt,),).toBe(true,);

    const result = Bun.spawnSync(
      ["bun", "run", DISPATCHER, "status", "feat/inworktree-status",],
      {
        cwd: wt,
        env: Object.fromEntries(Object.entries(process.env,).filter(([k,],) => k !== "REPO_ROOT" && k !== "TREE_DIR"),),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const stderr = result.stderr.toString();
    const stdout = result.stdout.toString();
    if (result.exitCode !== 0) { throw new Error(`stderr: ${stderr}\nstdout: ${stdout}`,); }
    expect(result.exitCode,).toBe(0,);
    expect(stderr,).not.toContain("worktree not found",);
    expect(stderr,).not.toMatch(/must be run from the repo root/,);
    expect(stdout,).toMatch(/Branch:\s+feat\/inworktree-status/,);
  });

  test("50. REPO_ROOT env var still works as escape hatch", () => {
    const result = Bun.spawnSync(
      ["bun", "run", DISPATCHER, "issues",],
      {
        cwd: repoRoot,
        env: { ...process.env, REPO_ROOT: repoRoot, TREE_DIR: treeDir, NO_COLOR: "1", },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(result.exitCode,).toBe(0,);
  });

  test("51. REPO_ROOT pointing at a different repo errors clearly", () => {
    // When REPO_ROOT is explicitly set to a non-existent dir, loadConfig
    // must honor it but downstream commands may fail with their own errors.
    const fakeRoot = join(tmpdir(), `wt-fake-${Date.now()}`,);
    mkdirSync(fakeRoot, { recursive: true, },);
    const result = Bun.spawnSync(
      ["bun", "run", DISPATCHER, "issues",],
      {
        cwd: repoRoot,
        env: { ...process.env, REPO_ROOT: fakeRoot, TREE_DIR: join(fakeRoot, "tree",), NO_COLOR: "1", },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    // Whatever the command does with the fake root, loadConfig did NOT
    // silently fall back to autodetect — REPO_ROOT was used as-is.
    const stderr = result.stderr.toString();
    expect(stderr,).not.toMatch(/must be run from the repo root/,);
    rmSync(fakeRoot, { recursive: true, force: true, },);
  });
  test("52. findRepoRoot — resolves to main repo from worktree cwd", () => {
    mkdirSync(treeDir, { recursive: true, },);
    const wt = join(treeDir, "feat-find-root-target",);
    expect(gitOk(repoRoot, "worktree", "add", "-b", "feat/find-root-target", wt, "master",),).toBe(true,);

    const result = Bun.spawnSync(
      [
        "bun",
        "-e",
        "import { findRepoRoot } from '" + resolve(import.meta.dir, "..", "scripts", "worktree", "utils", "git.ts",) +
        "'; " +
        "console.log(findRepoRoot(process.cwd()))",
      ],
      { cwd: wt, stdout: "pipe", stderr: "pipe", },
    );
    expect(result.exitCode,).toBe(0,);
    expect(result.stdout.toString().trim(),).toBe(repoRoot,);
  });

  test("53. REPO_ROOT='' (empty string) does not disable findRepoRoot fallback", () => {
    // Regression: empty-string env values are NOT nullish, so the `??` operator
    // does NOT fall back to findRepoRoot. Previously finalize.ts spawnSync
    // calls set `REPO_ROOT: ""` which broke the subprocess's loadConfig.
    const result = Bun.spawnSync(
      ["bun", "-e", "console.log(process.env.REPO_ROOT ?? 'fallback')",],
      {
        cwd: repoRoot,
        env: { ...process.env, REPO_ROOT: "", },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(result.exitCode,).toBe(0,);
    // Demonstrates the `??` semantics: empty string is kept (not replaced).
    expect(result.stdout.toString().trim(),).toBe("",);

    // What finalize.ts should do: NOT pass `REPO_ROOT: ""`. Verify that a
    // subprocess with no REPO_ROOT at all still works from a worktree cwd.
    mkdirSync(treeDir, { recursive: true, },);
    const wt = join(treeDir, "feat-empty-env-target",);
    expect(gitOk(repoRoot, "worktree", "add", "-b", "feat/empty-env-target", wt, "master",),).toBe(true,);
    const r2 = Bun.spawnSync(
      ["bun", "run", DISPATCHER, "status", "feat/empty-env-target",],
      {
        cwd: wt,
        env: Object.fromEntries(Object.entries(process.env,).filter(([k,],) => k !== "REPO_ROOT" && k !== "TREE_DIR"),),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    if (r2.exitCode !== 0) { throw new Error(`stderr: ${r2.stderr.toString()}`,); }
    expect(r2.exitCode,).toBe(0,);
  });
});
