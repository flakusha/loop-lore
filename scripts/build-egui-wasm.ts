// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * egui WASM frontend build stage — compiles native/loop-lore-egui to
 * wasm32-unknown-unknown, runs wasm-bindgen (`--target web`) and writes the
 * browser bundle plus a pre-compressed `.br` sibling into dist/public/egui/,
 * where the `/egui` host page (src/routes/views/egui.ts) and the static file
 * server pick them up.
 *
 * Unlike build-native.ts (which degrades to pure-TS fallbacks), this stage
 * NEVER degrades silently: missing cargo or wasm-bindgen CLI fails the build
 * with an install hint. A /egui page with no assets is a state the host page
 * survives at runtime by design — not a state the build should paper over.
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
  const lockPath = join(CRATE_DIR, "Cargo.lock",);
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
 * stem; the file lands under `<crate>/target/<triple>/release/`.
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
 * Preflight the toolchain before spending build minutes: the wasm-bindgen
 * CLI version must match the wasm-bindgen crate version in Cargo.lock, so
 * the hint names the pin instead of a generic "install it".
 */
function requireWasmBindgenCli(): void {
  if (wasmBindgenAvailable()) { return; }

  const pinned = pinnedWasmBindgenVersion();
  const version = pinned ?? "<version from native/loop-lore-egui/Cargo.lock>";
  fail(
    `wasm-bindgen CLI not found - install the version matching Cargo.lock: cargo install wasm-bindgen-cli --version ${version}`,
  );
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

  const artifact = join(CRATE_DIR, "target", WASM_TARGET, "release", wasmArtifactName(),);
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
  const wasmPath = join(OUT_DIR, `${OUT_NAME}.wasm`,);
  if (!existsSync(wasmPath,)) {
    fail(`expected ${wasmPath} not found after wasm-bindgen`,);
  }

  const compressed = brotliCompressSync(readFileSync(wasmPath,), {
    params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY, },
  },);

  const brPath = `${wasmPath}.br`;
  writeFileSync(brPath, compressed,);
  console.log(`[build:egui] OK ${OUT_NAME}.wasm.br (${(statSync(brPath,).size / 1024).toFixed(1,)} KB)`,);
}

// ── Main ─────────────────────────────────────────────────────────

function main(): void {
  console.log("=== build:egui ===",);
  if (!existsSync(join(CRATE_DIR, "Cargo.toml",),)) {
    fail(`${CRATE_DIR}/Cargo.toml missing`,);
  }

  if (!cargoAvailable()) {
    fail("cargo not found - install a Rust toolchain (cargo 1.99.0 or newer)",);
  }

  requireWasmBindgenCli();

  const artifact = buildWasm();
  runWasmBindgen(artifact,);
  writeBrotliVariant();
  console.log(`[build:egui] bundle ready at ${OUT_DIR}`,);
}

main();
