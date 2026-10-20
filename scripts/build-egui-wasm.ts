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
 * stage with a WARNING, the same rule build-native.ts follows - the absence
 * of the experimental egui artifact must never block the application build.
 * The /egui host page survives missing assets at runtime by design (the
 * status line carries the failure, the back button keeps working), so the
 * absence is surfaced there rather than papered over.
 *
 * A crate that does not COMPILE warns too, for the same reason: `bun run
 * build` runs this stage, so a non-zero exit here would be a red application
 * build over an OPTIONAL artifact. What keeps the pipeline honest about a
 * broken crate is the wasm32 type-check (scripts/native/check-wasm.ts) - a
 * gate of its own that fails the build, while this stage warns and omits
 * the bundle.
 *
 * Skipping INVALIDATES rather than leaves behind: a bundle from a previous
 * build is removed before the stage returns, so `dist/public/egui` can never
 * serve a stale artifact under a "successful" exit. A skip that cannot delete
 * the bundle says so loudly and still exits 0 - an undeletable file must not
 * block the app build either.
 *
 * The wasm-bindgen CLI version MUST match the wasm-bindgen crate version in the
 * workspace `Cargo.lock`; a mismatch yields glue that rejects the module at
 * runtime, so the install hint names the version resolved from there
 * (shared.pinnedWasmBindgenVersion) and points at the provisioner that
 * installs exactly that version (scripts/native/provision-wasm-bindgen.ts).
 *
 * Run via: `bun run build:egui`
 */

import { spawnSync, } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, } from "node:fs";
import { join, } from "node:path";
import { brotliCompressSync, constants, } from "node:zlib";
import { EGUI_BUNDLE_DIR, EGUI_STAMP_FILE, writeEguiStamp, } from "../src/build/egui-artifact";
import { jsonParseOr, } from "../src/utils/safe-json";
import { pinnedWasmBindgenVersion, REPO_ROOT, WASM_TARGET, } from "./native/shared";
import { ensureWasmToolchain, type WasmToolchain, } from "./native/toolchain";

/** Crate dir relative to this script (scripts/ → native/loop-lore-egui/). */
const CRATE_DIR = join(import.meta.dir, "..", "native", "loop-lore-egui",);

/**
 * Project root the bundle and its stamp are written under. Defaults to the
 * repo root; `EGUI_OUT_ROOT` points it at a throwaway tree so a test can
 * exercise this stage - whose skip path DELETES the bundle - without
 * touching the worktree's shared `dist/`, which every other build in the
 * same worktree writes to.
 */
const OUT_ROOT = process.env.EGUI_OUT_ROOT ?? REPO_ROOT;

/** Browser bundle dir — also the /egui/ static mount point. */
const OUT_DIR = join(OUT_ROOT, EGUI_BUNDLE_DIR,);

/** Build stamp written next to the bundle. */
const STAMP_FILE = join(OUT_ROOT, EGUI_STAMP_FILE,);

/** wasm-bindgen --out-name; the host page imports /egui/app.js. */
const OUT_NAME = "app";

/** Brotli quality for app_bg.wasm.br — max: the bundle is fetched once per visit. */
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
 * The installed wasm-bindgen CLI version, for the provenance stamp.
 * @returns the version string, or "" when the CLI cannot be interrogated
 */
function wasmBindgenVersion(): string {
  const probe = spawnSync("wasm-bindgen", ["--version",], { encoding: "utf8", },);
  return probe.status === 0 ? probe.stdout.trim() : "";
}

/**
 * @returns `true` when the wasm-bindgen CLI answers `--version`
 */
function wasmBindgenAvailable(): boolean {
  return wasmBindgenVersion() !== "";
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
 * Invalidate the bundle so a skip can never leave a stale artifact behind.
 * A "successful" build that skips must not leave last build's wasm on the
 * static mount: the /egui page would load it and report success while serving
 * bytes built from older Rust. Removes the bundle and its build stamp together
 * (a stamp without its bundle is as misleading as a bundle without a stamp).
 *
 * Removal failure is a WARNING, never fatal: an undeletable file must not
 * block the application build, but it must never pass silently either.
 *
 * @param reason - why the stage is skipping, echoed in the warning
 */
function invalidateStaleBundle(reason: string,): void {
  try {
    rmSync(OUT_DIR, { recursive: true, force: true, },);
    rmSync(STAMP_FILE, { force: true, },);
  } catch (error: unknown) {
    console.warn(
      `[build:egui] WARNING: could not remove the stale egui bundle at ${OUT_DIR} ` +
        `(${error instanceof Error ? error.message : String(error,)}). It may still be served - ` +
        `delete it by hand. Reason for the skip: ${reason}`,
    );
    return;
  }

  if (existsSync(OUT_DIR,)) {
    console.warn(
      `[build:egui] WARNING: ${OUT_DIR} still exists after the skip; a stale egui bundle may be served. Delete it by hand. Reason for the skip: ${reason}`,
    );
  }
}

/**
 * The single failure path of this stage: warn, invalidate the bundle, and
 * let the application build continue.
 *
 * The egui artifact must never block the app build - `bun run build` runs
 * this stage, so a non-zero exit here IS a red application build. A missing
 * toolchain AND a crate that does not compile both land here, each with its
 * own reason. What keeps the pipeline honest about a broken crate is the
 * wasm32 type-check (scripts/native/check-wasm.ts): a gate of its own that
 * fails the build, while this stage only warns and omits the bundle.
 * @param reason - why the stage is giving up, echoed in the warning
 * @param hint - what the operator can do about it
 */
function degrade(reason: string, hint?: string,): never {
  invalidateStaleBundle(reason,);
  console.warn(
    `[build:egui] WARNING: ${reason} - SKIPPING the egui WASM bundle.\n` +
      `  The /egui page degrades to its status line; no egui bundle will be produced or served.\n` +
      `  ${hint ?? "The UI code is still type-checked by scripts/native/check-wasm.ts."}`,
  );

  process.exit(0,);
}

/**
 * Optional-toolchain preflight: a missing wasm-bindgen CLI (or cargo) means
 * this stage is SKIPPED with a WARNING, mirroring build-native.ts - the app
 * build must never be blocked by the experimental egui artifact. The /egui
 * host page survives missing assets at runtime by design: the wasm boot
 * fails into the `#egui-status` text and the back button keeps working.
 *
 * The hint pins the CLI to `pinnedWasmBindgenVersion()` (the wasm-bindgen
 * CRATE version in the workspace Cargo.lock). A CLI whose version differs from
 * the crate emits glue the module rejects at runtime - the silent failure the
 * old `<version from ...>` placeholder used to invite, by naming a lockfile
 * this unified workspace does not have. The version now comes from the real
 * lock, and the provisioner installs exactly that version.
 */
function requireWasmBindgenCli(): void {
  if (wasmBindgenAvailable()) { return; }

  const pinned = pinnedWasmBindgenVersion();
  const hint = pinned
    ? `To build it: cargo install wasm-bindgen-cli --version ${pinned} ` +
      `(or: bun run scripts/native/provision-wasm-bindgen.ts - installs that exact version).`
    : `To build it: bun run scripts/native/provision-wasm-bindgen.ts ` +
      `(resolves the version the workspace Cargo.lock pins).`;

  degrade("wasm-bindgen CLI not found", hint,);
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
    degrade(error instanceof Error ? error.message : String(error,),);
  }

  const result = spawnSync(
    "cargo",
    ["build", "--release", "--target", WASM_TARGET, "--manifest-path", join(CRATE_DIR, "Cargo.toml",),],
    { stdio: "inherit", env: { ...process.env, ...toolchain.env, }, },
  );

  if (result.status !== 0) {
    degrade(`cargo build failed (status ${result.status}) - the crate does not compile for ${WASM_TARGET}`,);
  }

  const artifact = join(cargoReleaseDir(toolchain.env,), wasmArtifactName(),);
  if (!existsSync(artifact,)) {
    degrade(`expected ${artifact} not found`,);
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
    degrade(`wasm-bindgen failed (status ${result.status})`,);
  }
}

/**
 * Write app_bg.wasm.br next to app_bg.wasm so the static server's
 * pre-compressed variant negotiation (br > zstd > gzip) can serve the bundle.
 */
function writeBrotliVariant(): void {
  // wasm-bindgen `--target web` emits `<out-name>_bg.wasm` next to the glue.
  const wasmPath = join(OUT_DIR, `${OUT_NAME}_bg.wasm`,);
  if (!existsSync(wasmPath,)) {
    degrade(`expected ${wasmPath} not found after wasm-bindgen`,);
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
    degrade(`${CRATE_DIR}/Cargo.toml missing`,);
  }

  if (!cargoAvailable()) {
    // Optional native stage (parity with build-native.ts): never block the
    // application build. The /egui page degrades at runtime instead — but the
    // previous build's bundle is removed first so nothing stale survives.
    degrade(
      "cargo not found",
      "To build it: install a Rust toolchain (https://rustup.rs), then `bun run build:egui`.",
    );
  }

  requireWasmBindgenCli();

  const artifact = buildWasm();
  runWasmBindgen(artifact,);
  writeBrotliVariant();
  const stamp = writeEguiStamp(OUT_ROOT, { wasmBindgenVersion: wasmBindgenVersion(), },);
  console.log(`[build:egui] provenance stamp: ${stamp}`,);
  console.log(`[build:egui] bundle ready at ${OUT_DIR}`,);
}

main();
