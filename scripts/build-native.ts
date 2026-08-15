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
 *   - cargo available  → `cargo build --release --target-dir target` in
 *     `native/loop-lore-native/`, producing the shared library the FFI loader
 *     (`src/native/loader.ts`) dlopens at runtime.
 *   - cargo absent     → skip with a notice; the pure-TS implementation
 *     (src/native/fallback/) becomes the default. Never fails the build.
 *
 *   WASM modules (frontend, feature-split):
 *   - rustup available → `rustup target add wasm32-unknown-unknown` + standard
 *     `cargo build --target wasm32-unknown-unknown --release`.
 *   - system cargo (no rustup) with rust-src → `RUSTC_BOOTSTRAP=1 cargo build
 *     -Z build-std=std,panic_abort --target wasm32-unknown-unknown --release`.
 *   - neither available → skip wasm; JS fallbacks (zstd stubs, TS crypto)
 *     become the frontend default.
 *
 * Three wasm binaries from the same crate (feature-gated):
 *   `blake3.wasm`  — blake3 hashing only (small, ~200K)
 *   `zstd.wasm`    — zstd compression only (big, ~500K)
 *   `loop_lore_native.wasm` — both (full, ~700K)
 *
 * Each is copied to `dist/public/wasm/` for static serving.
 * Compiled artifacts live under the crate's `target/` dir, gitignored —
 * never committed.
 *
 * Run via: `bun run build:native`
 */

import { spawnSync, } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync, } from "node:fs";
import { join, } from "node:path";

/** Crate dir relative to this script (scripts/ → native/loop-lore-native/). */
const CRATE_DIR = join(import.meta.dir, "..", "native", "loop-lore-native",);

/** Frontend WASM output dir relative to repo root. */
const WASM_DIST = join(import.meta.dir, "..", "dist", "public", "wasm",);

/** WASM target triple. */
const WASM_TARGET = "wasm32-unknown-unknown";

/** Platforms with a supported shared-library target (see loader BINARY_NAMES). */
const SUPPORTED_PLATFORMS = new Set(["linux", "darwin", "win32",]);

// ── Detection helpers ────────────────────────────────────────────

function cargoAvailable(): boolean {
  const probe = spawnSync("cargo", ["--version",], { stdio: "ignore", });
  return probe.status === 0;
}

function rustupAvailable(): boolean {
  const probe = spawnSync("rustup", ["--version",], { stdio: "ignore", });
  return probe.status === 0;
}

/** Check if rust-src component is available (needed for build-std cross-compilation). */
function rustSrcAvailable(): boolean {
  const sysroot = spawnSync("rustc", ["--print", "sysroot",], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore",] });
  if (sysroot.status !== 0) return false;
  const rustlibSrc = join(sysroot.stdout.trim(), "lib", "rustlib", "src");
  return existsSync(join(rustlibSrc, "rust", "library", "core"));
}

// ── Build stages ─────────────────────────────────────────────────

/**
 * Build the native cdylib (.so/.dylib/.dll) for server-side Bun FFI.
 * Degrades gracefully — pure-TS fallback in src/native/fallback/.
 */
function buildNativeCdylib(): void {
  if (!SUPPORTED_PLATFORMS.has(process.platform)) {
    console.log("[build:native:cdylib] platform unsupported — TS fallback",);
    return;
  }
  if (!existsSync(join(CRATE_DIR, "Cargo.toml"))) {
    console.log("[build:native:cdylib] crate missing — TS fallback",);
    return;
  }
  if (!cargoAvailable()) {
    console.log("[build:native:cdylib] cargo not found — TS fallback",);
    return;
  }

  console.log("[build:native:cdylib] compiling Rust cdylib (release)...",);
  const result = spawnSync("cargo", ["build", "--release", "--target-dir", "target",], {
    cwd: CRATE_DIR,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`[build:native:cdylib] cargo build failed (status ${result.status}) — TS fallback`,);
    return;
  }
  console.log("[build:native:cdylib] native module ready (gitignored target/)",);
}

/**
 * Build WASM modules for browser-side frontend integration.
 *
 * Produces feature-split binaries for smaller browser downloads:
 *   - blake3.wasm (blake3 only)
 *   - zstd.wasm (zstd only)
 *   - loop_lore_native.wasm (both)
 */
function buildWasm(): void {
  if (!cargoAvailable()) {
    console.log("[build:native:wasm] cargo not found — skipping WASM",);
    return;
  }

  // ── Detect best compilation path ──────────────────────────────
  let useRustup = false;
  let useBuildStd = false;

  if (rustupAvailable()) {
    useRustup = true;
    console.log("[build:native:wasm] rustup detected — standard wasm target add");
  } else if (rustSrcAvailable()) {
    useBuildStd = true;
    console.log("[build:native:wasm] no rustup, rust-src found — build-std path");
  } else {
    console.log("[build:native:wasm] no rust toolchain — skipping WASM",);
    return;
  }

  // ── Ensure wasm target is available ───────────────────────────
  if (useRustup) {
    const targetAdd = spawnSync("rustup", ["target", "add", WASM_TARGET,], { stdio: "pipe", });
    if (targetAdd.status !== 0) {
      const stderr = targetAdd.stderr?.toString() ?? "";
      console.error(`[build:native:wasm] rustup target add failed: ${stderr.trim()}`,);
      return;
    }
  }

  // ── Build configurations (feature-split for smaller downloads) ──
  const builds: { features: string; outputName: string }[] = [
    { features: "blake3", outputName: "blake3.wasm" },
    { features: "zstd", outputName: "zstd.wasm" },
    { features: "blake3,zstd", outputName: "loop_lore_native.wasm" },
  ];

  const env: Record<string, string | undefined> = { ...process.env };
  const baseArgs = [
    "build", "--release", "--no-default-features",
    "--target", WASM_TARGET, "--target-dir", "target",
  ];
  if (useBuildStd) {
    baseArgs.push("-Z", "build-std=std,panic_abort");
    env.RUSTC_BOOTSTRAP = "1";
  }

  for (const { features, outputName } of builds) {
    const args = [...baseArgs, "--features", features];
    console.log(`[build:native:wasm] compiling ${outputName} (features: ${features})...`,);
    const result = spawnSync("cargo", args, {
      cwd: CRATE_DIR,
      env: env as { [key: string]: string },
      stdio: "inherit",
    });
    if (result.status !== 0) {
      console.error(`[build:native:wasm] ${outputName} failed (status ${result.status})`,);
      continue;
    }

    const src = join(CRATE_DIR, "target", WASM_TARGET, "release", "loop_lore_native.wasm");
    if (!existsSync(src)) {
      console.error(`[build:native:wasm] expected ${src} not found`,);
      continue;
    }

    mkdirSync(WASM_DIST, { recursive: true });
    const dest = join(WASM_DIST, outputName);
    copyFileSync(src, dest);
    const size = statSync(dest).size;
    console.log(`[build:native:wasm] OK ${outputName} (${(size / 1024).toFixed(1)} KB)`);
  }

  console.log(`[build:native:wasm] all modules ready at ${WASM_DIST}`);
}

// ── Main ─────────────────────────────────────────────────────────

function main(): void {
  console.log("=== build:native ===");
  buildNativeCdylib();
  buildWasm();
}

main();