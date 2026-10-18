// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * egui WASM frontend build stage — compiles native/loop-lore-egui to
 * wasm32-unknown-unknown, runs wasm-bindgen (`--target web`) and writes the
 * browser bundle plus a pre-compressed `.br` sibling into dist/public/egui/,
 * where the `/egui` host page (src/routes/views/egui.ts) and the static file
 * server pick them up.
 *
 * A MISSING optional toolchain (no cargo / no wasm-bindgen CLI) skips this
 * stage with a notice, the same rule build-native.ts follows - the absence
 * of the experimental egui artifact must never block the application build.
 * The /egui host page survives missing assets at runtime by design (the
 * status line carries the failure, the back button keeps working), so the
 * absence is surfaced there rather than papered over. A toolchain that is
 * present but FAILS (compile error, bindgen error) still fails this stage:
 * that is a genuine breakage, not an absent optional build.
 *
 * The wasm-bindgen CLI version MUST match the wasm-bindgen crate version in
 * native/loop-lore-egui/Cargo.lock; a mismatch yields glue that rejects the
 * module at runtime, so the install hint names the pinned version.
 *
 * Run via: `bun run build:egui`
 */

import { spawnSync, } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { brotliCompressSync, constants, } from "node:zlib";
import { jsonParseOr, } from "../src/utils/safe-json";
import { ensureWasmToolchain, type WasmToolchain, } from "./native/toolchain";

/** Crate dir relative to this script (scripts/ → native/loop-lore-egui/). */
const CRATE_DIR = join(import.meta.dir, "..", "native", "loop-lore-egui",);

/** Browser bundle dir — also the /egui/ static mount point. */
const OUT_DIR = join(import.meta.dir, "..", "dist", "public", "egui",);

/** WASM target triple. */
const WASM_TARGET = "wasm32-unknown-unknown";

/** wasm-bindgen --out-name; the host page imports /egui/app.js. */
const OUT_NAME = "app";

/** Brotli quality for app.wasm.br — max: the bundle is fetched once per visit. */
const BROTLI_QUALITY = 11;

// ── Detection helpers ────────────────────────────────────────────

/**
 * @returns `true` when cargo answers `--version`
 */
function cargoAvailable(): boolean {
  const probe = spawnSync("cargo", ["--version",], { stdio: "ignore", },);
  return probe.status === 0;
}

/**
 * @returns `true` when the wasm-bindgen CLI answers `--version`
 */
function wasmBindgenAvailable(): boolean {
  const probe = spawnSync("wasm-bindgen", ["--version",], { stdio: "ignore", },);
  return probe.status === 0;
}

/**
 * The wasm-bindgen CLI must match the wasm-bindgen crate version in
 * Cargo.lock, so the install hint reads the pin from there.
 * @returns the pinned crate version, or null when Cargo.lock is absent
 */
function pinnedWasmBindgenVersion(): string | null {
  const lockPath = join(import.meta.dir, "..", "Cargo.lock",);
  if (!existsSync(lockPath,)) { return null; }

  const lines = readFileSync(lockPath, "utf8",).split("\n",);
  for (const [index, line,] of lines.entries()) {
    if (line.trim() !== 'name = "wasm-bindgen"') { continue; }
    const version = /version = "([^"]+)"/.exec(lines[index + 1] ?? "",);
    if (version) { return version[1]; }
  }

  return null;
}

/**
 * `[lib] name` in Cargo.toml (dashes → underscores) is the cargo artifact
 * stem.
 * @returns the compiled .wasm file name
 */
function wasmArtifactName(): string {
  const lines = readFileSync(join(CRATE_DIR, "Cargo.toml",), "utf8",).split("\n",);
  const libStart = lines.findIndex((line,) => line.trim() === "[lib]");
  const nameLine = libStart === -1
    ? ""
    : (lines.slice(libStart + 1,).find((line,) => line.trim().startsWith("name",)) ?? "");

  const name = /"([\w-]+)"/.exec(nameLine,)?.[1] ?? "loop_lore_egui";
  return `${name.replaceAll("-", "_",)}.wasm`;
}

/**
 * Cargo's target directory for this crate, honoring `CARGO_TARGET_DIR` /
 * build config instead of assuming `<crate>/target` (the host sets a shared
 * `/tmp/cargo`).
 * @returns absolute path to the `${triple}/release` output dir
 */
function cargoReleaseDir(env: NodeJS.ProcessEnv,): string {
  const result = spawnSync(
    "cargo",
    ["metadata", "--format-version", "1", "--no-deps", "--manifest-path", join(CRATE_DIR, "Cargo.toml",),],
    { encoding: "utf8", env: { ...process.env, ...env, }, },
  );

  const target = result.status === 0
    ? jsonParseOr<{ target_directory?: string }>(result.stdout, {},).target_directory
    : undefined;

  const base = target ?? join(CRATE_DIR, "target",);
  return join(base, WASM_TARGET, "release",);
}

// ── Build stages ─────────────────────────────────────────────────

/**
 * Single failure path: one stderr line, non-zero exit.
 * @param message
 */
function fail(message: string,): never {
  console.error(`[build:egui] ${message}`,);
  process.exit(1,);
}

/**
 * Optional-toolchain preflight: a missing wasm-bindgen CLI (or cargo) means
 * this stage is SKIPPED with a notice, mirroring build-native.ts - the app
 * build must never be blocked by the experimental egui artifact. The /egui
 * host page survives missing assets at runtime by design: the wasm boot
 * fails into the `#egui-status` text and the back button keeps working.
 *
 * A toolchain that IS present but fails (compile error, bindgen error,
 * missing artifact) still fails the stage with exit 1 - that is a genuine
 * breakage, not an absent optional native build.
 */
function requireWasmBindgenCli(): void {
  if (wasmBindgenAvailable()) { return; }

  const pinned = pinnedWasmBindgenVersion();
  const version = pinned ?? "<version from native/loop-lore-egui/Cargo.lock>";
  console.log(
    `[build:egui] wasm-bindgen CLI not found - skipping the egui WASM bundle. ` +
      `The /egui page degrades to its status line. Install to build it: cargo install wasm-bindgen-cli --version ${version}`,
  );

  process.exit(0,);
}

/**
 * Compile the crate for wasm32-unknown-unknown.
 * @returns absolute path to the compiled .wasm artifact
 */
function buildWasm(): string {
  console.log("[build:egui] compiling Rust crate (release, wasm32)...",);
  let toolchain: WasmToolchain;
  try {
    toolchain = ensureWasmToolchain({ log: (line,) => console.log(line,), },);
  } catch (error: unknown) {
    fail(error instanceof Error ? error.message : String(error,),);
  }

  const result = spawnSync(
    "cargo",
    ["build", "--release", "--target", WASM_TARGET, "--manifest-path", join(CRATE_DIR, "Cargo.toml",),],
    { stdio: "inherit", env: { ...process.env, ...toolchain.env, }, },
  );

  if (result.status !== 0) {
    fail(`cargo build failed (status ${result.status})`,);
  }

  const artifact = join(cargoReleaseDir(toolchain.env,), wasmArtifactName(),);
  if (!existsSync(artifact,)) {
    fail(`expected ${artifact} not found`,);
  }

  return artifact;
}

/**
 * Run wasm-bindgen to emit the web glue + wasm into OUT_DIR. The CLI
 * availability check lives in main() so a missing toolchain fails before
 * the (minutes-long) cargo compile.
 * @param artifact - compiled wasm path
 */
function runWasmBindgen(artifact: string,): void {
  mkdirSync(OUT_DIR, { recursive: true, },);
  console.log("[build:egui] running wasm-bindgen (--target web)...",);
  const result = spawnSync(
    "wasm-bindgen",
    ["--target", "web", "--out-dir", OUT_DIR, "--out-name", OUT_NAME, artifact,],
    { stdio: "inherit", },
  );

  if (result.status !== 0) {
    fail(`wasm-bindgen failed (status ${result.status})`,);
  }
}

/**
 * Write app.wasm.br next to app.wasm so the static server's pre-compressed
 * variant negotiation (br > zstd > gzip) can serve the bundle.
 */
function writeBrotliVariant(): void {
  // wasm-bindgen `--target web` emits `<out-name>_bg.wasm` next to the glue.
  const wasmPath = join(OUT_DIR, `${OUT_NAME}_bg.wasm`,);
  if (!existsSync(wasmPath,)) {
    fail(`expected ${wasmPath} not found after wasm-bindgen`,);
  }

  const compressed = brotliCompressSync(readFileSync(wasmPath,), {
    params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY, },
  },);

  const brPath = `${wasmPath}.br`;
  writeFileSync(brPath, compressed,);
  console.log(`[build:egui] OK ${OUT_NAME}_bg.wasm.br (${(statSync(brPath,).size / 1024).toFixed(1,)} KB)`,);
}

// ── Main ─────────────────────────────────────────────────────────

function main(): void {
  console.log("=== build:egui ===",);
  if (!existsSync(join(CRATE_DIR, "Cargo.toml",),)) {
    fail(`${CRATE_DIR}/Cargo.toml missing`,);
  }

  if (!cargoAvailable()) {
    // Optional native stage (parity with build-native.ts): never block the
    // application build. The /egui page degrades at runtime instead.
    console.log(
      "[build:egui] cargo not found - skipping the egui WASM bundle (the /egui page degrades to its status line)",
    );

    return;
  }

  requireWasmBindgenCli();

  const artifact = buildWasm();
  runWasmBindgen(artifact,);
  writeBrotliVariant();
  console.log(`[build:egui] bundle ready at ${OUT_DIR}`,);
}

main();
