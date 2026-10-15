// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for build-egui-wasm.ts loud-failure contract: a missing or failing
 * wasm-bindgen CLI must exit non-zero with the install hint — the egui
 * stage never degrades silently (unlike build-native.ts).
 */
import { describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

const SCRIPT = join(import.meta.dir, "build-egui-wasm.ts",);

/**
 * Shim dir with a cargo that passes `--version` and `build` (so the run
 * reaches the wasm-bindgen stage) and a wasm-bindgen that fails everything.
 * @returns { dir, cleanup }
 */
function makeShims(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "b6-egui-",),);
  writeFileSync(join(dir, "cargo",), "#!/usr/bin/env bash\nexit 0\n",);
  writeFileSync(join(dir, "wasm-bindgen",), "#!/usr/bin/env bash\nexit 1\n",);
  chmodSync(join(dir, "cargo",), 0o755,);
  chmodSync(join(dir, "wasm-bindgen",), 0o755,);
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, },), };
}

/**
 * @param env - child environment
 * @returns { status, output } of the script run
 */
function runScript(env: Record<string, string | undefined>,): { status: number | null; output: string } {
  const result = spawnSync("bun", [SCRIPT,], { env, encoding: "utf8", },);
  return { status: result.status, output: (result.stderr ?? "") + (result.stdout ?? ""), };
}

describe("build-egui-wasm exit code", () => {
  test("fails loudly with the install hint when the wasm-bindgen CLI fails", () => {
    const { dir, cleanup, } = makeShims();
    try {
      const { status, output, } = runScript({ ...process.env, PATH: `${dir}:${process.env.PATH}`, },);
      expect(status,).not.toBe(0,);
      expect(output,).toContain("wasm-bindgen",);
      expect(output,).toContain("cargo install wasm-bindgen-cli",);
    } finally {
      cleanup();
    }
  });

  test("fails loudly when cargo is missing", () => {
    // A PATH with bun but no cargo: child_process resolves the executable
    // through the env's PATH, so bun must be reachable from the shim dir.
    const dir = mkdtempSync(join(tmpdir(), "b6-egui-nocargo-",),);
    symlinkSync(process.execPath, join(dir, "bun",),);
    try {
      const { status, output, } = runScript({ ...process.env, PATH: dir, },);
      expect(status,).not.toBe(0,);
      expect(output,).toContain("cargo not found",);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });
});
