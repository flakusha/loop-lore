// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared vocabulary for the Rust WASM toolchain resolver
 * (scripts/native/toolchain.ts) and the component provisioner
 * (scripts/native/provision.ts): the one target both stages need, the two
 * host locations they agree on, and the install record both read.
 */
import { existsSync, readFileSync, } from "node:fs";
import { join, } from "node:path";

/** The one target the native build stages need. */
export const WASM_TARGET = "wasm32-unknown-unknown";

/** Repo root, resolved from this file's location (scripts/native/ -> root). */
export const REPO_ROOT = join(import.meta.dir, "..", "..",);

/**
 * The wasm-bindgen CLI version the crate REQUIRES. A CLI whose version differs
 * from the wasm-bindgen crate emits glue that rejects the module at runtime, so
 * every install hint names the pinned number. Read from the workspace
 * `Cargo.lock` — this is a unified workspace, there is no per-crate lockfile.
 * @returns the pinned crate version, or null when Cargo.lock is absent/unreadable
 */
export function pinnedWasmBindgenVersion(): string | null {
  const lockPath = join(REPO_ROOT, "Cargo.lock",);
  if (!existsSync(lockPath,)) { return null; }

  const lines = readFileSync(lockPath, "utf8",).split("\n",);
  for (const [index, line,] of lines.entries()) {
    if (line.trim() !== 'name = "wasm-bindgen"') { continue; }
    const version = /version = "([^"]+)"/.exec(lines[index + 1] ?? "",);
    if (version) { return version[1]; }
  }

  return null;
}

/** Official component server (no keys, version-pinned URLs). */
export const DIST_BASE = "https://static.rust-lang.org/dist";

/** Repo-local overlay root; scratchpad, gitignored. */
export const OVERLAY_ROOT = join(import.meta.dir, "..", "..", ".tmp", "native-toolchain",);

/** One discovered rustc installation. */
export interface RustcInstall {
  /** absolute rustc path */
  path: string;
  /** semver only, e.g. `1.99.0` */
  version: string;
  /** rustc --print sysroot */
  sysroot: string;
  /** host triple, e.g. `x86_64-unknown-linux-gnu` */
  host: string;
}
