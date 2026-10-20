// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the build-egui-wasm.ts optional-native contract: a MISSING
 * toolchain (no cargo / no wasm-bindgen CLI) skips the stage with exit 0 —
 * the absence of the experimental egui artifact must never block the
 * application build, mirroring scripts/build-native.ts. A crate that does
 * not compile skips with a warning too, for the same reason: `bun run build`
 * runs this stage, so a non-zero exit here IS a red application build over an
 * optional artifact. What fails the build on a broken crate is the wasm32
 * type-check (scripts/native/check-wasm.ts), a gate of its own. That case is
 * not covered here: it needs a real cargo + target tree, and the `--version`
 * probe cannot distinguish "absent" from "broken".
 *
 * Resource contract (every test here runs in parallel with every other test
 * file in the worktree - `bun test` runs with --parallel):
 * - ALLOCATES: one `mkdtemp` PATH shim per test and one `mkdtemp` output
 *   root per test. Both are removed in the test's own `finally`.
 * - WRITES: only inside its own output root. The stage is pointed there via
 *   `EGUI_OUT_ROOT`, so the worktree's shared `dist/` - the gate suite's
 *   frontend build, the operator's `bun run build` - is never touched.
 * - READS: `Cargo.lock` and `package.json`, both read-only.
 */
import { describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const SCRIPT = join(import.meta.dir, "build-egui-wasm.ts",);
const ROOT = join(import.meta.dir, "..",);

/**
 * Shim dir holding a cargo that passes every invocation with no real build
 * behind it, and nothing else. `bun` is symlinked in because runScript
 * spawns the script BY NAME, so resolving it goes through this PATH too.
 *
 * The dir must be the WHOLE PATH, not a prefix of the real one: the case
 * under test is "cargo present, wasm-bindgen absent", and a real
 * /usr/local/bin/wasm-bindgen leaking through would make the script take
 * the BUILD path (a fake cargo produces no artifacts -> exit 1) instead of
 * the skip path this test asserts.
 * @returns { dir, cleanup }
 */
function makeCargoShim(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "b6-egui-cargo-",),);
  writeFileSync(join(dir, "cargo",), "#!/bin/sh\nexit 0\n",);
  chmodSync(join(dir, "cargo",), 0o755,);
  symlinkSync(process.execPath, join(dir, "bun",),);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, },), };
}

/**
 * A PATH whose only executable is bun itself: child_process resolves the
 * script through the env's PATH, so bun must be reachable from the shim dir.
 * @returns { dir, cleanup }
 */
function makeBunOnlyPath(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "b6-egui-bun-",),);
  symlinkSync(process.execPath, join(dir, "bun",),);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, },), };
}

/**
 * A throwaway project root the stage writes its bundle and stamp into.
 *
 * The stage's skip path DELETES the bundle and the stamp, so it must never
 * be pointed at the worktree's own `dist/`: that tree is the shared output
 * of every other build in this worktree. A test that writes - or deletes -
 * there races the gate suite (which builds the frontend into `dist/`), the
 * operator's `bun run build`, and every test that reads the bundle. Each
 * test below owns one of these roots and removes it again.
 *
 * @returns { root, cleanup }
 */
function makeOutRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "b6-egui-out-",),);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true, },), };
}

/**
 * @param env - child environment
 * @param outRoot - project root the stage writes into (this test's own tree)
 * @returns { status, output } of the script run
 */
function runScript(
  env: Record<string, string | undefined>,
  outRoot: string,
): { status: number | null; output: string } {
  const result = spawnSync("bun", [SCRIPT,], {
    cwd: ROOT,
    env: { ...env, EGUI_OUT_ROOT: outRoot, },
    encoding: "utf8",
  },);
  return { status: result.status, output: (result.stderr ?? "") + (result.stdout ?? ""), };
}

describe("build-egui-wasm optional-toolchain contract", () => {
  test("skips with exit 0 when cargo is missing", () => {
    const { dir, cleanup, } = makeBunOnlyPath();
    const { root, cleanup: cleanupOut, } = makeOutRoot();
    try {
      const { status, output, } = runScript({ ...process.env, PATH: dir, }, root,);
      expect(status,).toBe(0,);
      expect(output,).toContain("cargo not found - SKIPPING the egui WASM bundle",);
    } finally {
      cleanup();
      cleanupOut();
    }
  });

  test("skips with exit 0 (and the install hint) when the wasm-bindgen CLI is missing", () => {
    const { dir: bunOnly, cleanup: cleanupBun, } = makeBunOnlyPath();
    const { dir, cleanup, } = makeCargoShim();
    const { root, cleanup: cleanupOut, } = makeOutRoot();
    try {
      const { status, output, } = runScript({ ...process.env, PATH: `${dir}:${bunOnly}`, }, root,);
      expect(status,).toBe(0,);
      expect(output,).toContain("wasm-bindgen CLI not found - SKIPPING the egui WASM bundle",);
      expect(output,).toContain("cargo install wasm-bindgen-cli",);
    } finally {
      cleanup();
      cleanupBun();
      cleanupOut();
    }
  });

  test("a skip removes the stale bundle so it can never be served", () => {
    const { root, cleanup, } = makeOutRoot();
    const bundle = join(root, "dist", "public", "egui",);
    const stamp = join(root, "dist", "egui-build.json",);
    const wasm = join(bundle, "app_bg.wasm",);
    mkdirSync(bundle, { recursive: true, },);
    writeFileSync(wasm, "stale",);
    writeFileSync(stamp, "{}",);

    const { dir, cleanup: cleanupPath, } = makeBunOnlyPath();
    try {
      const { status, } = runScript({ ...process.env, PATH: dir, }, root,);
      expect(status,).toBe(0,);
      expect(existsSync(wasm,),).toBe(false,);
      expect(existsSync(stamp,),).toBe(false,);
    } finally {
      cleanupPath();
      cleanup();
    }
  });

  test("the install hint names the workspace-locked wasm-bindgen version", async () => {
    // The hint used to cite `native/loop-lore-egui/Cargo.lock`, which does not
    // exist: this is a unified workspace with ONE root Cargo.lock. A hint that
    // names a missing file is worse than none, so the version must come from
    // the real lock and must be a concrete semver.
    const lockText = await Bun.file(join(ROOT, "Cargo.lock",),).text();
    const pinned = /name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(lockText,)?.[1];
    expect(pinned,).toMatch(/^\d+\.\d+\.\d+/,);

    const { dir: bunOnly, cleanup: cleanupBun, } = makeBunOnlyPath();
    const { dir, cleanup, } = makeCargoShim();
    const { root, cleanup: cleanupOut, } = makeOutRoot();
    try {
      const { status, output, } = runScript({ ...process.env, PATH: `${dir}:${bunOnly}`, }, root,);
      expect(status,).toBe(0,);
      expect(output,).toContain(`cargo install wasm-bindgen-cli --version ${pinned}`,);
      expect(output,).not.toContain("<version from",);
    } finally {
      cleanup();
      cleanupBun();
      cleanupOut();
    }
  });

  test("package.json build keeps the server bundle ahead of the egui stage", async () => {
    const pkg = await Bun.file(join(ROOT, "package.json",),).json();
    const build: string = pkg.scripts.build;
    const server = build.indexOf("build:server",);
    const egui = build.indexOf("build:egui",);
    expect(server,).toBeGreaterThanOrEqual(0,);
    expect(egui,).toBeGreaterThan(server,);
  });
});
