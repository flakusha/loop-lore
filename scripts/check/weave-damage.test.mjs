// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the two halves of the weave-damage gate that a later edit could
// silently break: the MIN_DUPE_LENGTH boundary (a run of normal `});` shape
// must never register) and the "no baseline" skip for paths absent at the
// base ref. Without the skip every new file is scored against zero, so any
// legitimate >15-char repeat in it reads as weave damage.

import { expect, test, } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
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

/** Run the gate against a throwaway repo, then remove it. */
function withRepo(fn,) {
  const dir = mkdtempSync(join(tmpdir(), "weave-damage-test-",),);
  const git = args => Bun.spawnSync(["git", ...args,], { cwd: dir, stdout: "pipe", stderr: "pipe", },);
  try {
    mkdirSync(join(dir, "scripts", "check",), { recursive: true, },);
    // The gate resolves its repo root from its own location, so the copy has
    // to sit at <repo>/scripts/check/ for PROJECT_ROOT to be the fixture.
    copyFileSync(join(import.meta.dir, "weave-damage.mjs",), join(dir, "scripts", "check", "weave-damage.mjs",),);
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

function runGate(dir,) {
  const proc = Bun.spawnSync(["bun", "run", join(dir, "scripts", "check", "weave-damage.mjs",),], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, WEAVE_BASE: "HEAD", },
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
    Bun.spawnSync(["git", "add", "brand-new.ts",], { cwd: dir, stdout: "pipe", stderr: "pipe", },);
    const { code, out, } = runGate(dir,);
    expect(out,).toContain("1 new (no baseline)",);
    expect(out,).not.toContain("brand-new.ts",);
    expect(code,).toBe(0,);
  },);
});
