#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the conflict-marker gate contract: git's 7-char marker line shapes
// register (including the diff3 base marker and the bare `=======` fence),
// a markdown setext underline one `=` wider does not, and a staged file
// carrying markers fails the scan with its path listed while a clean tree
// exits 0.

import { expect, test, } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { CONFLICT_MARKER_PATTERN, } from "./conflict-markers.mjs";

const marker = new RegExp(CONFLICT_MARKER_PATTERN,);

test("git marker line shapes register", () => {
  expect(marker.test("<<<<<<< HEAD",),).toBe(true,);
  expect(marker.test("=======",),).toBe(true,);
  expect(marker.test(">>>>>>> dev",),).toBe(true,);
  expect(marker.test("||||||| base",),).toBe(true,);
});

test("look-alike legal lines do not register", () => {
  // Setext H1 underline: eight `=` — one wider than git's fixed marker width.
  expect(marker.test("========",),).toBe(false,);
  // Quoting/decoration shapes without git's 7-char + space form.
  expect(marker.test(">>> quoted text",),).toBe(false,);
  expect(marker.test("<<<<<<<HEAD",),).toBe(false,);
});

/**
 * One throwaway git repo per call, staged with `files` (name → content) and
 * holding a copy of the gate at scripts/check/ (the gate resolves its repo
 * root from its own location). Removed in `finally` so a failed assertion
 * cannot leak it. Returns the copied gate's exit code and stdout.
 *
 * Git runs with GIT_* stripped and global/system config disabled: a host
 * GIT_DIR/GIT_WORK_TREE (plausible under the finalize hooks) would redirect
 * the fixture into the caller's repo and scan the wrong tree.
 */
function scanFixture(files,) {
  const root = mkdtempSync(join(tmpdir(), "conflict-markers-",),);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", };
  for (const key of Object.keys(env,)) {
    if (key.startsWith("GIT_",)) { delete env[key]; }
  }
  try {
    const script = join(root, "scripts", "check", "conflict-markers.mjs",);
    mkdirSync(join(root, "scripts", "check",), { recursive: true, },);
    copyFileSync(join(import.meta.dir, "conflict-markers.mjs",), script,);
    const git = (...args) => Bun.spawnSync(["git", ...args,], { cwd: root, stdout: "pipe", stderr: "pipe", env, },);
    git("init", "-q", ".",);
    for (const [name, content,] of Object.entries(files,)) {
      writeFileSync(join(root, name,), content,);
    }
    git("add", "-A",);
    // Staged is enough: git grep searches index-tracked working-tree files.
    const proc = Bun.spawnSync(["bun", "run", script,], { cwd: root, stdout: "pipe", stderr: "pipe", env, },);
    return { code: proc.exitCode, out: new TextDecoder().decode(proc.stdout,), };
  } finally {
    rmSync(root, { recursive: true, force: true, },);
  }
}

test("markers in a staged file fail the scan with the path listed", () => {
  const { code, out, } = scanFixture({
    "conflicted.ts": "const a = 1;\n<<<<<<< HEAD\nconst b = 2;\n=======\nconst b = 3;\n>>>>>>> dev\n",
  },);
  expect(code,).toBe(1,);
  expect(out,).toContain("conflicted.ts",);
});

test("a setext underline wider than the marker passes clean", () => {
  const { code, out, } = scanFixture({
    "notes.md": "Title\n========\nbody text\n",
    "clean.ts": "const ok = true;\n",
  },);
  expect(code,).toBe(0,);
  expect(out,).toContain("clean",);
});
