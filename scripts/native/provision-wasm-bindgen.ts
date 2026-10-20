// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Provision the wasm-bindgen CLI at the version the workspace `Cargo.lock`
 * resolves.
 *
 * The CLI and the wasm-bindgen CRATE must agree exactly: a mismatch emits
 * glue that rejects the module at runtime - a silent failure the build
 * cannot see. So the version comes from the ONE workspace lock (there is no
 * per-crate lockfile), never from a hardcoded number that drifts.
 *
 * The official release binary is used first: it is the exact build of the
 * matching tag and installs in seconds. `cargo install` is the fallback for a
 * platform without a published binary.
 *
 * NEVER fails the build. A provisioning failure (no network, no cargo, an
 * unsupported platform) is a WARNING and a skip: the egui bundle is optional
 * and the application build must not die because a helper binary could not be
 * fetched. The bundle stage (scripts/build-egui-wasm.ts) then skips with its
 * own warning, and the release reports that the bundle was omitted.
 *
 * The directory holding the binary is printed on stdout and appended to
 * `$GITHUB_PATH` when running under GitHub Actions, so the caller gets it on
 * PATH for the following steps.
 *
 * Run via: bun run scripts/native/provision-wasm-bindgen.ts
 */

import { spawnSync, } from "node:child_process";
import { createHash, } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, } from "node:fs";
import { homedir, } from "node:os";
import { dirname, join, } from "node:path";
import { pinnedWasmBindgenVersion, REPO_ROOT, } from "./shared";

/** Where the provisioned CLI lives (scratchpad, gitignored). */
const INSTALL_ROOT = join(REPO_ROOT, ".tmp", "wasm-bindgen",);

/** Release base for the official prebuilt binaries. */
const RELEASE_BASE = "https://github.com/wasm-bindgen/wasm-bindgen/releases/download";

/** The semver of the installed CLI, or "" when it cannot be interrogated. */
function installedVersion(): string {
  const probe = spawnSync("wasm-bindgen", ["--version",], { encoding: "utf8", },);
  if (probe.status !== 0) { return ""; }
  return /(\d+\.\d+\.\d+)/.exec(probe.stdout,)?.[1] ?? "";
}

/**
 * The release target triple for this host, or null when the project
 * publishes no binary for it.
 * @returns the target triple
 */
function releaseTarget(): string | null {
  if (process.platform === "linux") {
    if (process.arch === "x64") { return "x86_64-unknown-linux-musl"; }
    if (process.arch === "arm64") { return "aarch64-unknown-linux-musl"; }
    return null;
  }

  if (process.platform === "darwin") {
    if (process.arch === "x64") { return "x86_64-apple-darwin"; }
    if (process.arch === "arm64") { return "aarch64-apple-darwin"; }
    return null;
  }

  return null;
}

/**
 * Download the official binary, verify it against the published sha256
 * sidecar, and unpack it into `dir`.
 * @param version - the pinned wasm-bindgen version
 * @param dir - directory to unpack into
 * @returns `true` when the CLI is in place
 */
function installFromRelease(version: string, dir: string,): boolean {
  const target = releaseTarget();
  if (!target) { return false; }

  const name = `wasm-bindgen-${version}-${target}`;
  const url = `${RELEASE_BASE}/${version}/${name}.tar.gz`;
  const tarball = join(dir, `${name}.tar.gz`,);

  const download = spawnSync("curl", ["-fL", "--retry", "3", "-o", tarball, url,], { stdio: "inherit", },);
  if (download.status !== 0) { return false; }

  const sidecar = spawnSync("curl", ["-fsSL", `${url}.sha256sum`,], { encoding: "utf8", },);
  if (sidecar.status !== 0) { return false; }

  const expected = sidecar.stdout.trim().split(/\s+/,)[0];
  const actual = createHash("sha256",).update(readFileSync(tarball,),).digest("hex",);
  if (expected !== actual) {
    console.warn(
      `[wasm-bindgen] WARNING: sha256 mismatch for ${tarball} - expected ${expected}, got ${actual}. Not installing it.`,
    );
    return false;
  }

  const unpack = spawnSync("tar", ["-xzf", tarball, "-C", dir, "--strip-components=1",], { stdio: "inherit", },);
  if (unpack.status !== 0) { return false; }

  const binary = join(dir, "wasm-bindgen",);
  if (!existsSync(binary,)) { return false; }

  chmodSync(binary, 0o755,);
  return true;
}

/**
 * The directory `cargo install` writes binaries to.
 * @returns the cargo bin directory
 */
function cargoBinDir(): string {
  return join(process.env.CARGO_HOME ?? join(homedir(), ".cargo",), "bin",);
}

/**
 * Fallback for a platform with no published binary: build the CLI from the
 * crates.io release of the same version.
 * @param version - the pinned wasm-bindgen version
 * @returns the directory holding the CLI, or null when the install failed
 */
function installFromCargo(version: string,): string | null {
  if (spawnSync("cargo", ["--version",], { stdio: "ignore", cwd: REPO_ROOT, },).status !== 0) {
    return null;
  }

  const result = spawnSync(
    "cargo",
    ["install", "wasm-bindgen-cli", "--version", version, "--locked",],
    { stdio: "inherit", cwd: REPO_ROOT, env: { ...process.env, }, },
  );

  return result.status === 0 ? cargoBinDir() : null;
}

/**
 * Hand the directory to the caller: printed on stdout, and prepended to the
 * PATH of the following steps under GitHub Actions.
 * @param dir - directory holding the CLI
 */
function publishPath(dir: string,): void {
  const pathFile = process.env.GITHUB_PATH;
  if (pathFile) {
    try {
      appendFileSync(pathFile, `${dir}\n`,);
    } catch (error: unknown) {
      console.warn(
        `[wasm-bindgen] WARNING: could not add ${dir} to $GITHUB_PATH ` +
          `(${error instanceof Error ? error.message : String(error,)}). ` +
          `Add it to PATH by hand for the steps that follow.`,
      );
    }
  }

  console.log(dir,);
}

function main(): void {
  const version = pinnedWasmBindgenVersion();
  if (!version) {
    console.warn(
      "[wasm-bindgen] WARNING: the workspace Cargo.lock does not resolve a wasm-bindgen version - " +
        "cannot provision the CLI. The egui WASM bundle will be omitted; the app build continues.",
    );
    return;
  }

  if (installedVersion() === version) {
    console.warn(`[wasm-bindgen] CLI already at ${version} - nothing to provision.`,);
    // The binary can live anywhere on PATH (a distro package, /usr/local/bin),
    // so publish the directory it is actually in - not the cargo bin dir.
    const found = Bun.which("wasm-bindgen",);
    publishPath(found ? dirname(found,) : cargoBinDir(),);
    return;
  }

  const dir = join(INSTALL_ROOT, version,);
  mkdirSync(dir, { recursive: true, },);

  let binDir: string | null = null;
  if (installFromRelease(version, dir,)) {
    binDir = dir;
    console.warn(`[wasm-bindgen] installed ${version} from the official release.`,);
  } else {
    binDir = installFromCargo(version,);
    if (binDir) { console.warn(`[wasm-bindgen] installed ${version} with cargo install.`,); }
  }

  if (!binDir) {
    console.warn(
      `[wasm-bindgen] WARNING: could not provision the wasm-bindgen CLI ${version} ` +
        "(no network, no cargo, or an unsupported platform). The egui WASM bundle will be " +
        "omitted; the app build continues.",
    );
    return;
  }

  publishPath(binDir,);
}

main();
