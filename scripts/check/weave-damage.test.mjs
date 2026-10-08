// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the two halves of the weave-damage gate that a later edit could
// silently break: the MIN_DUPE_LENGTH boundary (a run of normal `});` shape
// must never register) and the "no baseline" skip for paths absent at the
// base ref. Without the skip every new file is scored against zero, so any
// legitimate >15-char repeat in it reads as weave damage.

import { expect, test, } from "bun:test";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { countConsecutiveDupes, } from "./weave-damage.mjs";

const fifteen = '"aaaaaaaaaaaaa"'; // 15 chars — must NOT register
const sixteen = '"aaaaaaaaaaaaaa"'; // 16 chars — must register

test("a repeat at the length boundary does not register", () => {
  expect(fifteen.length,).toBe(15,);
  expect(countConsecutiveDupes(`${fifteen}\n${fifteen}\n`,),).toBe(0,);
});

test("a repeat one character past the boundary registers", () => {
  expect(sixteen.length,).toBe(16,);
  expect(countConsecutiveDupes(`${sixteen}\n${sixteen}\n`,),).toBe(1,);
});

test("a run of N identical lines counts N-1 pairs", () => {
  expect(countConsecutiveDupes(`${sixteen}\n${sixteen}\n${sixteen}\n`,),).toBe(2,);
});

test("no duplicates and degenerate input count zero", () => {
  expect(countConsecutiveDupes("",),).toBe(0,);
  expect(countConsecutiveDupes("one line only",),).toBe(0,);
  expect(countConsecutiveDupes(`${sixteen}\nother content here\n`,),).toBe(0,);
});

/**
 * Resource contract — every `withRepo` call owns exactly one OS temp
 * directory (`mkdtempSync`, so unique per test and per parallel run) holding
 * a private git repo, and removes it in `finally`: a failed assertion cannot
 * leak either. The tests share no process-global state, never change `cwd`,
 * and do not depend on one another's order.
 *
 * Git runs with repo-pointing env stripped and global/system config
 * disabled. Otherwise a host `GIT_DIR`/`GIT_WORK_TREE` (plausible under the
 * finalize hooks) redirects the fixture into the caller's repo, and a global
 * `commit.gpgsign = true` can block the fixture commit on a signer prompt.
 */
function isolatedGitEnv() {
  const env = {};
  for (const [key, value,] of Object.entries(process.env,)) {
    if (value === undefined) { continue; }
    // Prefix-match rather than an allowlist: the caller can set a GIT_ var
    // this list never enumerates. `GIT_CONFIG_COUNT` + `GIT_CONFIG_KEY_n`
    // inject config straight from the environment, so a hostile
    // `core.hooksPath` or `commit.gpgsign` rides past the
    // GIT_CONFIG_GLOBAL=/dev/null below and breaks the fixture commit for
    // reasons unrelated to the gate. Mirrors
    // scripts/worktree/utils/git.ts.
    if (key.startsWith("GIT_",)) { continue; }
    env[key] = value;
  }
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_CONFIG_SYSTEM = "/dev/null";
  env.GIT_CONFIG_NOSYSTEM = "1";
  return env;
}

/** Run git inside the fixture repo, insulated from the host environment. */
function spawnGit(dir, args,) {
  return Bun.spawnSync(["git", ...args,], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: isolatedGitEnv(),
  },);
}

/** Run the gate against a throwaway repo, then remove it. */
function withRepo(fn,) {
  const dir = mkdtempSync(join(tmpdir(), "weave-damage-test-",),);
  const git = args => spawnGit(dir, args,);
  try {
    mkdirSync(join(dir, "scripts", "check",), { recursive: true, },);
    // The gate resolves its repo root from its own location, so the copy has
    // to sit at <repo>/scripts/check/ for PROJECT_ROOT to be the fixture. It
    // also imports the shared Optique wrapper, so `src/cli` and node_modules
    // are symlinked in — the scan only reads git paths, so these never affect
    // what the gate measures.
    const repoRoot = join(import.meta.dir, "..", "..",);
    copyFileSync(
      join(import.meta.dir, "weave-damage.mjs",),
      join(dir, "scripts", "check", "weave-damage.mjs",),
    );
    mkdirSync(join(dir, "src",), { recursive: true, },);
    symlinkSync(join(repoRoot, "src", "cli",), join(dir, "src", "cli",), "dir",);
    symlinkSync(join(repoRoot, "node_modules",), join(dir, "node_modules",), "dir",);
    git(["init", "-q", ".",],);
    git(["config", "user.email", "gate@example.com",],);
    git(["config", "user.name", "gate",],);
    writeFileSync(join(dir, "tracked.ts",), "const base = 1;\n",);
    git(["add", "-A",],);
    git(["commit", "-q", "-m", "base",],);
    fn(dir,);
  } finally {
    rmSync(dir, { recursive: true, force: true, },);
  }
}

function runGate(dir, { args = [], weaveBase = "HEAD", } = {},) {
  const env = { ...isolatedGitEnv(), };
  if (weaveBase !== null) { env.WEAVE_BASE = weaveBase; }
  else { delete env.WEAVE_BASE; }
  const proc = Bun.spawnSync(["bun", "run", join(dir, "scripts", "check", "weave-damage.mjs",), ...args,], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env,
  },);
  return { code: proc.exitCode, out: new TextDecoder().decode(proc.stdout,), };
}

test("growth in a tracked file is reported and fails the gate", () => {
  withRepo((dir,) => {
    const file = join(dir, "tracked.ts",);
    writeFileSync(file, `${sixteen}\n${sixteen}\n`, { flag: "a", },);
    const { code, out, } = runGate(dir,);
    expect(out,).toContain("tracked.ts",);
    expect(code,).toBe(1,);
  },);
});

test("a new file is skipped, not scored against a zero baseline", () => {
  withRepo((dir,) => {
    // Identical repeat that WOULD trip the gate if it had a baseline. Staged,
    // because `git diff` never lists untracked paths — a rebase-resolved file
    // is tracked, which is the case this gate actually meets.
    writeFileSync(join(dir, "brand-new.ts",), `${sixteen}\n${sixteen}\n`,);
    spawnGit(dir, ["add", "brand-new.ts",],);
    const { code, out, } = runGate(dir,);
    expect(out,).toContain("1 new (no baseline)",);
    expect(out,).not.toContain("brand-new.ts",);
    expect(code,).toBe(0,);
  },);
});

// Argv contract after the Optique migration: the positional ref, the
// WEAVE_BASE fallback, and the zero-arg no-op the gate registry relies on
// (`checks["weave - damage scan"]` is NOOP_OK unless WEAVE_BASE is set).
test("a positional ref drives the scan with no WEAVE_BASE set", () => {
  withRepo((dir,) => {
    writeFileSync(join(dir, "tracked.ts",), `${sixteen}\n${sixteen}\n`, { flag: "a", },);
    const { code, out, } = runGate(dir, { args: ["HEAD",], weaveBase: null, },);
    expect(out,).toContain("tracked.ts",);
    expect(code,).toBe(1,);
  },);
});

test("zero args with no WEAVE_BASE is a skipped no-op that exits 0", () => {
  withRepo((dir,) => {
    const { code, out, } = runGate(dir, { weaveBase: null, },);
    expect(out,).toContain("skipped (no base ref",);
    expect(code,).toBe(0,);
  },);
});

test("an undeclared flag is a parse error, not a base ref named --nope", () => {
  withRepo((dir,) => {
    const proc = Bun.spawnSync(
      ["bun", "run", join(dir, "scripts", "check", "weave-damage.mjs",), "--nope",],
      { cwd: dir, stdout: "pipe", stderr: "pipe", env: isolatedGitEnv(), },
    );
    expect(proc.exitCode,).toBe(1,);
    expect(new TextDecoder().decode(proc.stderr,),).toContain("--nope",);
  },);
});
