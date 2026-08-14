// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Native module build stage — compiles the Rust cdylib when a toolchain
 * exists, and degrades gracefully when it does not.
 *
 * Build-stage integration model:
 * - cargo available  → `cargo build --release --target-dir target` in
 *   `native/loop-lore-native/`, producing the shared library the FFI loader
 *   (`src/native/loader.ts`) dlopens at runtime.
 * - cargo absent     → skip with a notice; the pure-TS implementation
 *   (src/native/fallback/) becomes the default. Never fails the build.
 *
 * The binary lives under the crate's `target/` dir, which is gitignored —
 * no compiled artifacts are ever committed.
 *
 * Run via: `bun run build:native`
 */

import { spawnSync, } from "node:child_process";
import { existsSync, } from "node:fs";
import { join, } from "node:path";

/** Crate dir relative to this script (scripts/ → native/loop-lore-native/). */
const CRATE_DIR = join(import.meta.dir, "..", "native", "loop-lore-native",);

/** Platforms with a supported shared-library target (see loader BINARY_NAMES). */
const SUPPORTED_PLATFORMS = new Set(["linux", "darwin", "win32",],);

function cargoAvailable(): boolean {
  const probe = spawnSync("cargo", ["--version",], { stdio: "ignore", },);
  return probe.status === 0;
}

function buildNative(): void {
  if (!SUPPORTED_PLATFORMS.has(process.platform,)) {
    console.log(`[build:native] platform ${process.platform} unsupported — TS implementation is default`,);
    return;
  }
  if (!existsSync(join(CRATE_DIR, "Cargo.toml",),)) {
    console.log("[build:native] crate missing (native/loop-lore-native/Cargo.toml) — TS implementation is default",);
    return;
  }
  if (!cargoAvailable()) {
    console.log("[build:native] cargo not found — TS implementation is default (no native binary)",);
    return;
  }

  console.log("[build:native] compiling Rust cdylib (release)…",);
  const result = spawnSync("cargo", ["build", "--release", "--target-dir", "target",], {
    cwd: CRATE_DIR,
    stdio: "inherit",
  },);
  if (result.status !== 0) {
    // A broken toolchain must not take the app down — degrade to TS default.
    console.error(`[build:native] cargo build failed (status ${result.status}) — TS implementation is default`,);
    return;
  }
  console.log("[build:native] native module ready (gitignored target/ — never committed)",);
}

buildNative();
