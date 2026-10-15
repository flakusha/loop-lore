// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared vocabulary for the Rust WASM toolchain resolver
 * (scripts/native/toolchain.ts) and the component provisioner
 * (scripts/native/provision.ts): the one target both stages need, the two
 * host locations they agree on, and the install record both read.
 */
import { join, } from "node:path";

/** The one target the native build stages need. */
export const WASM_TARGET = "wasm32-unknown-unknown";

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
