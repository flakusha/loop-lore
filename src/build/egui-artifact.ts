// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * egui artifact identity — the link between the Rust sources under `native/`
 * and the wasm bundle the static server actually hands out.
 *
 * `computeBuildIdentity` hashes the source tree, so editing a `.rs` file moves
 * `sourceTreeHash` and `build:verify` cheerfully reports "OK: matches local"
 * while `dist/public/egui/` still holds the bundle from the previous build.
 * `dist` is excluded from the source hash by design (it is an output, not
 * source), so nothing else in the identity covers the artifact. This module
 * closes that hole: the build stage stamps the Rust-source hash it compiled
 * FROM, and the read side reports whether the bundle on disk still matches it.
 *
 * Absence is a supported state, not a defect: no Rust toolchain means no
 * bundle, and `bun run build` must still succeed. Only a bundle that EXISTS and
 * disagrees with its stamp is stale — that is the case a verifier must refuse
 * to call "OK".
 */

import { existsSync, readdirSync, readFileSync, } from "node:fs";
import path from "node:path";
import { safeJsonParse, safeJsonStringify, } from "../utils";

/** Browser bundle dir, relative to the project root. */
export const EGUI_BUNDLE_DIR = path.join("dist", "public", "egui",);

/** Build stamp written by `bun run build:egui`, relative to the project root. */
export const EGUI_STAMP_FILE = path.join("dist", "egui-build.json",);

/** The compiled module wasm-bindgen emits — the freshness witness for the bundle. */
const EGUI_WASM_FILE = "app_bg.wasm";

/** Rust subtrees whose contents feed the artifact. */
const RUST_ROOTS = ["native",];

/** Cargo build output is never an input to the hash. */
const RUST_EXCLUDE_DIRS: Record<string, true> = { target: true, };

/** Provenance recorded by the build stage when it emits the bundle. */
export interface EguiBuildStamp {
  /** sha256 over the Rust sources, as of this build. */
  rustSourceHash: string;
  /** sha256 of the emitted app_bg.wasm. */
  artifactHash: string;
  /** wasm-bindgen CLI that produced the glue, or "" when it could not be read. */
  wasmBindgenVersion: string;
  /** ISO timestamp of the build. */
  builtAt: string;
}

/**
 * What a verifier can honestly say about the bundle on disk.
 * - `absent` — no bundle; a supported state when the Rust toolchain is missing.
 * - `fresh`  — the bundle exists and matches its stamp.
 * - `stale`  — the bundle exists but does NOT match its stamp (or has none).
 */
export interface EguiArtifactState {
  status: "absent" | "fresh" | "stale";
  /** One line naming the evidence, for humans. */
  detail: string;
  /** sha256 over the Rust sources as they are RIGHT NOW. */
  rustSourceHash: string;
  /** sha256 of app_bg.wasm on disk, or "" when absent. */
  artifactHash: string;
  /** The stamp the build left behind, or null when there is none to read. */
  stamp: EguiBuildStamp | null;
}

/** @returns sha256 hex of `data` */
function sha256Hex(data: string | Uint8Array,): string {
  const hasher = new Bun.CryptoHasher("sha256",);
  hasher.update(data,);
  return hasher.digest("hex",);
}

/**
 * Sorted `[relPath, sha256(bytes)]` pairs for every Rust input under `root`.
 * @param projectRoot - repo root paths are reported relative to
 * @returns the pairs, sorted by path so the resulting hash is order-stable
 */
function rustInputPairs(projectRoot: string,): [string, string,][] {
  const pairs: [string, string,][] = [];

  const walk = (dir: string,): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true, },)) {
      if (entry.isDirectory()) {
        if (!RUST_EXCLUDE_DIRS[entry.name]) { walk(path.join(dir, entry.name,),); }
        continue;
      }

      const full = path.join(dir, entry.name,);
      pairs.push([path.relative(projectRoot, full,), sha256Hex(readFileSync(full,),),],);
    }
  };

  for (const root of RUST_ROOTS) {
    const dir = path.join(projectRoot, root,);
    if (existsSync(dir,)) { walk(dir,); }
  }

  const lock = path.join(projectRoot, "Cargo.lock",);
  if (existsSync(lock,)) { pairs.push(["Cargo.lock", sha256Hex(readFileSync(lock,),),],); }

  pairs.sort(([a,], [b,],) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs;
}

/**
 * sha256 over every Rust input that feeds the egui wasm bundle: the `native/`
 * sources and the workspace `Cargo.lock` (the wasm-bindgen CRATE version lives
 * there, and a bump changes the emitted glue).
 *
 * Deliberately narrower than `sourceTreeHash`: it answers "would a rebuild
 * produce a different bundle?", not "is the server running these bytes?".
 *
 * @param projectRoot - repo root to hash under
 * @returns 64-char lowercase hex sha-256
 */
export function rustSourceHash(projectRoot: string,): string {
  const hasher = new Bun.CryptoHasher("sha256",);
  for (const [rel, hash,] of rustInputPairs(projectRoot,)) {
    hasher.update(`${rel}\0${hash}\0`,);
  }

  return hasher.digest("hex",);
}

/**
 * Record which Rust sources the bundle on disk was built from. Written only on
 * the success path of `build:egui`; a skipped build removes it along with the
 * bundle, so a stamp never outlives the artifact it describes.
 *
 * @param projectRoot - repo root the bundle lives under
 * @param options.wasmBindgenVersion - CLI version that produced the glue
 * @returns absolute path of the stamp written
 * @throws {Error} when the wasm is missing or the stamp cannot be written — a
 *   build that cannot record its provenance cannot claim freshness later
 */
export function writeEguiStamp(
  projectRoot: string,
  options: { wasmBindgenVersion: string },
): string {
  const wasmPath = path.join(projectRoot, EGUI_BUNDLE_DIR, EGUI_WASM_FILE,);
  const stamp: EguiBuildStamp = {
    rustSourceHash: rustSourceHash(projectRoot,),
    artifactHash: sha256Hex(readFileSync(wasmPath,),),
    wasmBindgenVersion: options.wasmBindgenVersion,
    builtAt: new Date().toISOString(),
  };

  const serialized = safeJsonStringify(stamp,);
  if (!serialized.ok) {
    throw new Error(`egui stamp serialization failed: ${serialized.error.message}`,);
  }

  const stampPath = path.join(projectRoot, EGUI_STAMP_FILE,);
  Bun.write(stampPath, serialized.value,);
  return stampPath;
}

/**
 * Read the stamp, treating a malformed one as absent: an unreadable stamp is
 * no evidence of freshness, which is exactly what the caller needs to know.
 *
 * @param projectRoot - repo root holding dist/
 * @returns the parsed stamp, or null when missing or unusable
 */
function readEguiStamp(projectRoot: string,): EguiBuildStamp | null {
  const stampPath = path.join(projectRoot, EGUI_STAMP_FILE,);
  if (!existsSync(stampPath,)) { return null; }

  const parsed = safeJsonParse<Partial<EguiBuildStamp>>(readFileSync(stampPath, "utf8",),);
  if (!parsed.ok) { return null; }
  const stamp = parsed.value;
  if (typeof stamp.rustSourceHash !== "string" || typeof stamp.artifactHash !== "string") {
    return null;
  }

  return {
    rustSourceHash: stamp.rustSourceHash,
    artifactHash: stamp.artifactHash,
    wasmBindgenVersion: typeof stamp.wasmBindgenVersion === "string" ? stamp.wasmBindgenVersion : "",
    builtAt: typeof stamp.builtAt === "string" ? stamp.builtAt : "",
  };
}

/**
 * Compare the bundle on disk against the Rust sources it claims to come from.
 *
 * @param projectRoot - repo root holding dist/
 * @returns the honest verdict — `absent` is fine, `stale` is not
 */
export function readEguiArtifactState(projectRoot: string,): EguiArtifactState {
  const wasmPath = path.join(projectRoot, EGUI_BUNDLE_DIR, EGUI_WASM_FILE,);
  const currentRustHash = rustSourceHash(projectRoot,);

  if (!existsSync(wasmPath,)) {
    return {
      status: "absent",
      detail: "no dist/public/egui bundle — supported when the Rust toolchain is absent",
      rustSourceHash: currentRustHash,
      artifactHash: "",
      stamp: null,
    };
  }

  const artifactHash = sha256Hex(readFileSync(wasmPath,),);
  const stamp = readEguiStamp(projectRoot,);
  if (stamp === null) {
    return {
      status: "stale",
      detail:
        "dist/public/egui exists with no usable build stamp — provenance unknown, rebuild with `bun run build:egui`",
      rustSourceHash: currentRustHash,
      artifactHash,
      stamp: null,
    };
  }

  if (stamp.rustSourceHash !== currentRustHash) {
    return {
      status: "stale",
      detail: "Rust sources changed after the bundle was built — rebuild with `bun run build:egui`",
      rustSourceHash: currentRustHash,
      artifactHash,
      stamp,
    };
  }

  if (stamp.artifactHash !== artifactHash) {
    return {
      status: "stale",
      detail: "dist/public/egui does not match its own stamp — the bundle was replaced after the build",
      rustSourceHash: currentRustHash,
      artifactHash,
      stamp,
    };
  }

  return {
    status: "fresh",
    detail: "dist/public/egui matches the Rust sources it was built from",
    rustSourceHash: currentRustHash,
    artifactHash,
    stamp,
  };
}
