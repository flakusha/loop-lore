// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Contract test for scripts/native/toolchain.ts: the resolver must produce a
 * rustc that can answer `--print cfg --target wasm32-unknown-unknown` with
 * wasm32 settings. That is exactly what broke when the system installs (here:
 * the Gentoo rust-bin plus the from-source slot) shipped no wasm32 std, and
 * it is the property the egui/native wasm build stages depend on.
 *
 * Hosts without any rustc skip: the loud-failure path needs a rustc-less
 * discovery, which distro slot discovery makes unreachable by design.
 */
import { describe, expect, test, } from "bun:test";
import { spawnSync, } from "node:child_process";
import { rmSync, } from "node:fs";
import { join, } from "node:path";
import { OVERLAY_ROOT, } from "./shared";

const SCRIPT = join(import.meta.dir, "toolchain.ts",);

const haveRustc = Bun.which("rustc",) !== null;

describe("ensureWasmToolchain", () => {
  test.skipIf(!haveRustc,)("resolves a rustc that compiles for wasm32-unknown-unknown on a fresh prefix", () => {
    // Wipe the overlay first: the fresh-prefix path is where provisioning
    // breaks, and a cached overlay hides it (it did: a readdir on the
    // not-yet-created wasmDir threw ENOENT).
    rmSync(OVERLAY_ROOT, { recursive: true, force: true, },);
    const run = spawnSync("bun", [SCRIPT,], { encoding: "utf8", },);
    expect(run.status,).toBe(0,);
    const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    expect(output,).toContain("strategy: ",);

    const rustc = run.stdout?.split("\n",).find((line,) => line.startsWith("rustc: ",))?.slice(7,).trim();
    expect(rustc,).toBeDefined();

    const cfg = spawnSync(rustc!, ["--print", "cfg", "--target", "wasm32-unknown-unknown",], {
      encoding: "utf8",
    },);

    expect(cfg.status,).toBe(0,);
    expect(cfg.stdout,).toContain('target_arch="wasm32"',);
  }, 120_000,);

  test.skipIf(!haveRustc,)("is idempotent - a second resolve reuses the overlay", () => {
    const first = spawnSync("bun", [SCRIPT,], { encoding: "utf8", },);
    expect(first.status,).toBe(0,);
    const second = spawnSync("bun", [SCRIPT,], { encoding: "utf8", },);
    expect(second.status,).toBe(0,);
    expect(second.stdout,).not.toContain("fetching rust-std-",);
  }, 120_000,);
});
