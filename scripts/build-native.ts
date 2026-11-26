// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Native + WASM module build stage — compiles the Rust cdylib AND optionally
 * the wasm32-unknown-unknown binary, producing artifacts for both server-side
 * Bun FFI and browser-side WASM frontend support.
 *
 * Build-stage integration model (two paths):
 *
 *   Native cdylib:
 *   - cargo available  → `cargo build --release` in
 *     `native/loop-lore-native/` (target dir: the shared `/tmp/cargo` via
 *     `CARGO_TARGET_DIR`), producing the shared library the FFI loader
 *     (`src/native/loader.ts`) dlopens at runtime.
 *   - cargo absent     → skip with a notice; the pure-TS implementation
 *     (src/native/fallback/) becomes the default. Never fails the build.
 *
 *   WASM modules (frontend, feature-split):
 *   - wasm32 std via scripts/native/toolchain.ts — a std the host already
 *     ships, `rustup target add`, or the version-matched official component
 *     provisioned into the shared build scratch (/tmp/cargo/native-toolchain/)
 *     and reached through a RUSTC
 *     --sysroot wrapper (no sudo, no cross-install copies).
 *   - none available (no rustc / offline) → skip with a notice; JS fallbacks
 *     (zstd stubs, TS crypto) become the frontend default.
 *
 * Three wasm binaries from the same crate (feature-gated):
 *   `blake3.wasm`  — blake3 hashing only (small, ~200K)
 *   `zstd.wasm`    — zstd compression only (big, ~500K)
 *   `loop_lore_native.wasm` — both (full, ~700K)
 *
 * Each is copied to `dist/public/wasm/` for static serving.
 * Compiled artifacts live under the shared `/tmp/cargo` target dir
 * (never committed, never under the repo tree).
 *
 * Run via: `bun run build:native`
 */

import { spawnSync, } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync, } from "node:fs";
import { join, } from "node:path";
import { jsonParseOr, } from "../src/utils/safe-json";
import { ensureWasmToolchain, } from "./native/toolchain";

/** Crate dir relative to this script (scripts/ → native/loop-lore-native/). */
const CRATE_DIR = join(import.meta.dir, "..", "native", "loop-lore-native",);

/** Frontend WASM output dir relative to repo root. */
const WASM_DIST = join(import.meta.dir, "..", "dist", "public", "wasm",);

/** WASM target triple. */
const WASM_TARGET = "wasm32-unknown-unknown";

/**
 * Cargo's target directory for this crate, honoring `CARGO_TARGET_DIR` /
 * build config instead of assuming a repo-local `target/` (the host sets a
 * shared `/tmp/cargo`).
 * @returns absolute path to the `${triple}/release` output dir
 */
function cargoReleaseDir(): string {
  const result = spawnSync(
    "cargo",
    ["metadata", "--format-version", "1", "--no-deps", "--manifest-path", join(CRATE_DIR, "Cargo.toml",),],
    { encoding: "utf8", },
  );

  const base = result.status === 0
    ? jsonParseOr<{ target_directory?: string }>(result.stdout, {},).target_directory
    : undefined;

  return join(base ?? join(import.meta.dir, "..", "target",), WASM_TARGET, "release",);
}

/** Platforms with a supported shared-library target (see loader BINARY_NAMES). */
const SUPPORTED_PLATFORMS = new Set(["linux", "darwin", "win32",],);

// ── Detection helpers ────────────────────────────────────────────

function cargoAvailable(): boolean {
  const probe = spawnSync("cargo", ["--version",], { stdio: "ignore", },);
  return probe.status === 0;
}

function rustupAvailable(): boolean {
  const probe = spawnSync("rustup", ["--version",], { stdio: "ignore", },);
  return probe.status === 0;
}

// ── Build stages ─────────────────────────────────────────────────

/**
 * Build the native cdylib (.so/.dylib/.dll) for server-side Bun FFI.
 * Degrades gracefully — pure-TS fallback in src/native/fallback/.
 */
function buildNativeCdylib(): boolean {
  if (!SUPPORTED_PLATFORMS.has(process.platform,)) {
    console.log("[build:native:cdylib] platform unsupported - TS fallback",);
    return true;
  }

  if (!existsSync(join(CRATE_DIR, "Cargo.toml",),)) {
    console.log("[build:native:cdylib] crate missing - TS fallback",);
    return true;
  }

  if (!cargoAvailable()) {
    console.log("[build:native:cdylib] cargo not found - TS fallback",);
    return true;
  }

  console.log("[build:native:cdylib] compiling Rust cdylib (release)...",);
  const result = spawnSync("cargo", ["build", "--release",], {
    cwd: CRATE_DIR,
    stdio: "inherit",
  },);

  if (result.status !== 0) {
    console.error(`[build:native:cdylib] cargo build failed (status ${result.status})`,);
    return false;
  }

  console.log("[build:native:cdylib] native module ready (gitignored target/)",);
  return true;
}

/**
 * Build WASM modules for browser-side frontend integration.
 *
 * Produces feature-split binaries for smaller browser downloads:
 *   - blake3.wasm (blake3 only)
 *   - zstd.wasm (zstd only)
 *   - loop_lore_native.wasm (both)
 */
function buildWasm(): boolean {
  if (!cargoAvailable()) {
    console.log("[build:native:wasm] cargo not found - skipping WASM",);
    return true;
  }

  // ── Resolve a wasm-capable toolchain ─────────────────────────
  const toolchain = ensureWasmToolchain(
    { log: (line,) => console.log(`[build:native:wasm] ${line}`,), optional: true, },
  );

  if (!toolchain) {
    console.log("[build:native:wasm] no wasm toolchain - skipping WASM (JS fallbacks stay)",);
    return true;
  }

  console.log(`[build:native:wasm] wasm32 std via ${toolchain.strategy} (${toolchain.rustc})`,);

  // ── Build configurations (feature-split for smaller downloads) ──
  const builds: { features: string; outputName: string }[] = [
    { features: "blake3", outputName: "blake3.wasm", },
    { features: "zstd", outputName: "zstd.wasm", },
    { features: "blake3,zstd", outputName: "loop_lore_native.wasm", },
  ];

  const env: NodeJS.ProcessEnv = { ...process.env, ...toolchain.env, };
  const baseArgs = [
    "build",
    "--release",
    "--no-default-features",
    "--target",
    WASM_TARGET,
  ];

  for (const { features, outputName, } of builds) {
    const args = [...baseArgs, "--features", features,];
    console.log(`[build:native:wasm] compiling ${outputName} (features: ${features})...`,);
    const result = spawnSync("cargo", args, {
      cwd: CRATE_DIR,
      env,
      stdio: "inherit",
    },);

    if (result.status !== 0) {
      console.error(`[build:native:wasm] ${outputName} failed (status ${result.status})`,);
      return false;
    }

    const src = join(cargoReleaseDir(), "loop_lore_native.wasm",);
    if (!existsSync(src,)) {
      console.error(`[build:native:wasm] expected ${src} not found`,);
      return false;
    }

    mkdirSync(WASM_DIST, { recursive: true, },);
    const dest = join(WASM_DIST, outputName,);
    copyFileSync(src, dest,);
    const size = statSync(dest,).size;
    console.log(`[build:native:wasm] OK ${outputName} (${(size / 1024).toFixed(1,)} KB)`,);
  }

  console.log(`[build:native:wasm] all modules ready at ${WASM_DIST}`,);
  return true;
}

// ── Main ─────────────────────────────────────────────────────────

function main(): void {
  console.log("=== build:native ===",);
  const cdylibOk = buildNativeCdylib();
  const wasmOk = buildWasm();
  if (!cdylibOk || !wasmOk) {
    process.exit(1,);
  }
}

main();
