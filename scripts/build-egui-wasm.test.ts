// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the build-egui-wasm.ts optional-native contract: a MISSING
 * toolchain (no cargo / no wasm-bindgen CLI) skips the stage with exit 0 —
 * the absence of the experimental egui artifact must never block the
 * application build, mirroring scripts/build-native.ts. A toolchain that IS
 * present but fails still exits non-zero — not covered here: that case needs
 * a real cargo + target tree, and the `--version` probe cannot distinguish
 * "absent" from "broken".
 */
import { describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const SCRIPT = join(import.meta.dir, "build-egui-wasm.ts",);
const ROOT = join(import.meta.dir, "..",);

/**
 * Shim dir holding a cargo that passes every invocation with no real build
 * behind it.
 * @returns { dir, cleanup }
 */
function makeCargoShim(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "b6-egui-cargo-",),);
  writeFileSync(join(dir, "cargo",), "#!/bin/sh\nexit 0\n",);
  chmodSync(join(dir, "cargo",), 0o755,);
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
      expect(output,).toContain("cargo not found - skipping the egui WASM bundle",);
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
      expect(output,).toContain("wasm-bindgen CLI not found - skipping the egui WASM bundle",);
      expect(output,).toContain("cargo install wasm-bindgen-cli",);
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
