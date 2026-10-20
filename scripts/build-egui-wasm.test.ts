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
 * @param env - child environment
 * @returns { status, output } of the script run
 */
function runScript(env: Record<string, string | undefined>,): { status: number | null; output: string } {
  const result = spawnSync("bun", [SCRIPT,], { cwd: ROOT, env, encoding: "utf8", },);
  return { status: result.status, output: (result.stderr ?? "") + (result.stdout ?? ""), };
}

describe("build-egui-wasm optional-toolchain contract", () => {
  test("skips with exit 0 when cargo is missing", () => {
    const { dir, cleanup, } = makeBunOnlyPath();
    try {
      const { status, output, } = runScript({ ...process.env, PATH: dir, },);
      expect(status,).toBe(0,);
      expect(output,).toContain("cargo not found - SKIPPING the egui WASM bundle",);
    } finally {
      cleanup();
    }
  });

  test("skips with exit 0 (and the install hint) when the wasm-bindgen CLI is missing", () => {
    const { dir: bunOnly, cleanup: cleanupBun, } = makeBunOnlyPath();
    const { dir, cleanup, } = makeCargoShim();
    try {
      const { status, output, } = runScript({ ...process.env, PATH: `${dir}:${bunOnly}`, },);
      expect(status,).toBe(0,);
      expect(output,).toContain("wasm-bindgen CLI not found - SKIPPING the egui WASM bundle",);
      expect(output,).toContain("cargo install wasm-bindgen-cli",);
    } finally {
      cleanup();
      cleanupBun();
    }
  });

  test("a skip removes the stale bundle so it can never be served", () => {
    const bundle = join(ROOT, "dist", "public", "egui",);
    const stamp = join(ROOT, "dist", "egui-build.json",);
    const wasm = join(bundle, "app_bg.wasm",);
    const hadBundle = existsSync(wasm,);
    const hadStamp = existsSync(stamp,);
    mkdirSync(bundle, { recursive: true, },);
    writeFileSync(wasm, "stale",);
    writeFileSync(stamp, "{}",);

    const { dir, cleanup, } = makeBunOnlyPath();
    try {
      const { status, } = runScript({ ...process.env, PATH: dir, },);
      expect(status,).toBe(0,);
      expect(existsSync(wasm,),).toBe(false,);
      expect(existsSync(stamp,),).toBe(false,);
    } finally {
      cleanup();
      rmSync(join(ROOT, "dist",), { recursive: true, force: true, },);
      if (hadBundle) {
        mkdirSync(bundle, { recursive: true, },);
        writeFileSync(wasm, "",);
      }
      if (hadStamp) {
        writeFileSync(stamp, "",);
      }
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
    try {
      const { status, output, } = runScript({ ...process.env, PATH: `${dir}:${bunOnly}`, },);
      expect(status,).toBe(0,);
      expect(output,).toContain(`cargo install wasm-bindgen-cli --version ${pinned}`,);
      expect(output,).not.toContain("<version from",);
    } finally {
      cleanup();
      cleanupBun();
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
