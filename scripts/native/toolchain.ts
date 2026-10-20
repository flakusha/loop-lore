// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rust WASM toolchain discovery for the native build stages
 * (`scripts/build-native.ts`, `scripts/build-egui-wasm.ts`). The provisioning
 * branch lives in `scripts/native/provision.ts`, the shared vocabulary in
 * `scripts/native/shared.ts`.
 *
 * Why this exists: `cargo build --target wasm32-unknown-unknown` only works
 * when the rustc cargo resolves ships the wasm32 std in its sysroot, and there
 * is no single "Rust install" to assume:
 *
 * - rustup toolchains: the target is one `rustup target add` away, and the
 *   rustup proxy IS the compiler cargo invokes - no env juggling.
 * - distro system installs (Gentoo ships /opt/rust-bin-<ver> AND a from-source
 *   /usr/lib/rust/<ver> slot side by side): both carry only the host target,
 *   so a wasm build dies with "can't find crate for `core`". The PATH rustc
 *   resolves to the default slot, which is not necessarily the best one.
 * - `-Zbuild-std` (the historic workaround in build-native.ts) needs a
 *   nightly compiler plus the rust-src component and keeps a second copy of
 *   std in the build tree - deleted in favour of the real std below.
 *
 * Resolution order (first hit wins; NOTHING is copied out of any system
 * install):
 * 1. `system` - any discovered rustc already has the wasm32 std (best version
 *    wins, so multi-slot distros pick the capable slot even when the default
 *    slot lacks it).
 * 2. `rustup` - the PATH rustc is the rustup proxy: `rustup target add`.
 * 3. `provisioned` - provision.ts downloads the version-matched official
 *    rust-std component from static.rust-lang.org, sha256-verifies it, and
 *    installs it with its OWN install.sh into a repo-local prefix under
 *    `.tmp/`. The prefix references the host install by symlink (host rustlib
 *    + bin), and cargo is pointed at it via a one-line RUSTC wrapper adding
 *    `--sysroot` - the same mechanism rustup uses. No sudo, no copying.
 *
 * Usage: `bun run scripts/native/toolchain.ts` prints the resolution and
 * exits non-zero when no wasm-capable toolchain can be produced.
 */
import { spawnSync, } from "node:child_process";
import { existsSync, readdirSync, } from "node:fs";
import { homedir, } from "node:os";
import { dirname, join, } from "node:path";
import { provisionWasmStd, } from "./provision";
import { REPO_ROOT, type RustcInstall, WASM_TARGET, } from "./shared";

/** A resolved wasm-capable toolchain, ready to hand to cargo. */
export interface WasmToolchain {
  /** how the capability was obtained, for logs */
  strategy: "system" | "rustup" | "provisioned";
  /** the rustc cargo should use (wrapper when provisioned) */
  rustc: string;
  /** env additions for cargo (`RUSTC` when provisioned, empty otherwise) */
  env: Record<string, string>;
}

/**
 * readdir that tolerates a missing directory.
 * @param dir directory to list
 */
function readdirSafe(dir: string,): string[] {
  try {
    return readdirSync(dir,);
  } catch {
    return [];
  }
}

/**
 * `true` when a candidate ships the wasm32 std.
 * @param install probed rustc installation
 */
function hasWasmStd(install: RustcInstall,): boolean {
  return readdirSafe(join(install.sysroot, "lib", "rustlib", WASM_TARGET,),).some(
    (name,) => /^libstd-.*\.rlib$/.test(name,),
  );
}

/**
 * Probe one rustc binary for version, sysroot and host triple.
 * @param path rustc path or command name
 */
function probeInstall(path: string,): RustcInstall | null {
  const verbose = spawnSync(path, ["-vV",], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore",], },);
  if (verbose.status !== 0) { return null; }
  const fields = new Map<string, string>();
  for (const line of verbose.stdout.split("\n",)) {
    const at = line.indexOf(":",);
    if (at > 0) { fields.set(line.slice(0, at,).trim(), line.slice(at + 1,).trim(),); }
  }

  const version = fields.get("release",)?.match(/^\d+\.\d+\.\d+/,)?.[0];
  const host = fields.get("host",);
  if (!version || !host) { return null; }
  const sysroot = spawnSync(path, ["--print", "sysroot",], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore",],
  },);

  if (sysroot.status !== 0) { return null; }
  return { path, version, sysroot: sysroot.stdout.trim(), host, };
}

/**
 * Version-part comparator, descending.
 * @param a version parts
 * @param b version parts
 */
function compareVersionsDesc(a: number[], b: number[],): number {
  for (let i = 0; i < Math.max(a.length, b.length,); i++) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) { return diff; }
  }

  return 0;
}

/**
 * Every rustc discoverable on this host: explicit RUSTC, PATH, the rustup
 * default, and distro slots (`/opt/rust-bin-*`, `/usr/lib/rust/*`). Covers
 * "system installation(s)" plural without privileging the default slot.
 */
function discoverInstalls(): RustcInstall[] {
  const paths = new Set<string>();
  const env = process.env.RUSTC;
  if (env) { paths.add(env,); }
  const onPath = Bun.which("rustc",);
  if (onPath) { paths.add(onPath,); }
  if (Bun.which("rustup",)) {
    const resolved = spawnSync("rustup", ["which", "rustc",], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore",],
    },);

    if (resolved.status === 0 && resolved.stdout.trim()) { paths.add(resolved.stdout.trim(),); }
  }

  for (const root of [join(homedir(), ".rustup", "toolchains",), "/opt", "/usr/lib/rust",]) {
    for (const entry of readdirSafe(root,)) {
      const candidate = join(root, entry, "bin", "rustc",);
      if (existsSync(candidate,)) { paths.add(candidate,); }
    }
  }

  const installs: RustcInstall[] = [];
  for (const path of paths) {
    const install = probeInstall(path,);
    if (install) { installs.push(install,); }
  }

  return installs;
}

/**
 * The discovered installs in resolution order: the one the PATH rustc
 * resolves to FIRST, then the rest by descending version.
 *
 * The PATH rustc is the toolchain cargo will actually build with: with a
 * rustup proxy that is the repo's rust-toolchain.toml pin, NOT the newest
 * toolchain on the box (a CI action installs `stable` as the default, and
 * the pin overrides it inside this directory). The rest stay in the list as
 * the fallbacks this resolver exists for - a distro with several system
 * installs, where the default slot may lack the wasm std and another slot
 * carries it.
 * @param installs - the discovered installs, newest first
 * @returns the installs in resolution order
 */
function orderInstalls(installs: RustcInstall[],): RustcInstall[] {
  const pathRustc = Bun.which("rustc",);
  const effective = pathRustc ? installs.find((install,) => install.path === pathRustc) : undefined;
  if (!effective) { return installs; }

  return [effective, ...installs.filter((install,) => install !== effective),];
}

/**
 * `true` when this rustc is rustup's: either the proxy rustup installs next
 * to itself in $CARGO_HOME/bin, or the toolchain rustc `rustup which` names.
 *
 * The proxy is the one that matters. It resolves the repo's
 * rust-toolchain.toml pin, so the toolchain behind it is the one cargo
 * actually builds with - and `rustup target add` (no --toolchain) acts on
 * exactly that toolchain. `rustup which rustc` names the toolchain's own
 * rustc instead, which is a different path than the proxy.
 * @param path rustc path
 */
function rustupManages(path: string,): boolean {
  const rustup = Bun.which("rustup",);
  if (rustup && dirname(path,) === dirname(rustup,)) { return true; }

  const resolved = spawnSync("rustup", ["which", "rustc",], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore",],
  },);

  return resolved.status === 0 && resolved.stdout.trim() === path;
}

/**
 * Resolve a wasm-capable toolchain, provisioning one when necessary.
 *
 * @param options.log progress sink (default: silent)
 * @param options.optional when true, return null instead of throwing when nothing works
 * @returns the resolved toolchain, or null in optional mode
 */
export function ensureWasmToolchain(
  options: { optional: true; log?: (line: string,) => void },
): WasmToolchain | null;
export function ensureWasmToolchain(
  options?: { optional?: false; log?: (line: string,) => void },
): WasmToolchain;
export function ensureWasmToolchain(
  options: { log?: (line: string,) => void; optional?: boolean } = {},
): WasmToolchain | null {
  const log = options.log;
  const installs = discoverInstalls();
  if (installs.length === 0) {
    const message = "no rustc found - install a Rust toolchain (rustup is easiest: https://rustup.rs)";
    if (options.optional) {
      log?.(`[toolchain] ${message}`,);
      return null;
    }

    throw new Error(`[toolchain] ${message}`,);
  }

  installs.sort((a, b,) =>
    compareVersionsDesc(
      a.version.split(".",).map(Number,),
      b.version.split(".",).map(Number,),
    )
  );

  const ordered = orderInstalls(installs,);

  for (const install of ordered) {
    if (hasWasmStd(install,)) {
      log?.(`[toolchain] ${install.path} (${install.version}) ships ${WASM_TARGET} std`,);
      return { strategy: "system", rustc: install.path, env: {}, };
    }
  }

  const preferred = installs.find((install,) => install.path === process.env.RUSTC) ??
    ordered[0];

  if (rustupManages(preferred.path,)) {
    // The ACTIVE toolchain is the one the toolchain file pins, and it is the
    // one cargo resolves here - so the target has to land there, not on the
    // toolchain a CI action installed as the default.
    const added = spawnSync("rustup", ["target", "add", WASM_TARGET,], { stdio: "inherit", cwd: REPO_ROOT, },);
    if (added.status === 0) {
      const reprobe = probeInstall(preferred.path,);
      if (reprobe && hasWasmStd(reprobe,)) {
        log?.(`[toolchain] rustup target added: ${WASM_TARGET} for ${preferred.version}`,);
        return { strategy: "rustup", rustc: preferred.path, env: {}, };
      }
    }
  }

  try {
    const wrapper = provisionWasmStd(preferred, log,);
    log?.(`[toolchain] overlay ready: ${wrapper}`,);
    return { strategy: "provisioned", rustc: wrapper, env: { RUSTC: wrapper, }, };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error,);
    const message = `cannot provision ${WASM_TARGET} std for ${preferred.path} ` +
      `(${preferred.version}, ${preferred.host}): ${detail}. ` +
      "Fix: rustup target add wasm32-unknown-unknown, or point RUSTC at a toolchain that ships it.";

    if (options.optional) {
      log?.(`[toolchain] ${message}`,);
      return null;
    }

    throw new Error(`[toolchain] ${message}`,);
  }
}

if (import.meta.main) {
  const toolchain = ensureWasmToolchain({ log: (line,) => console.log(line,), },);
  if (!toolchain) { process.exit(1,); }
  console.log(`strategy: ${toolchain.strategy}`,);
  console.log(`rustc: ${toolchain.rustc}`,);
  for (const [key, value,] of Object.entries(toolchain.env,)) {
    console.log(`${key}=${value}`,);
  }
}
