// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Native module loader — Bun FFI bridge for pre-compiled hot binaries.
 *
 * Loads `libloop_lore_native.{so,dylib,dll}` (built from
 * `native/loop-lore-native/`, a Rust cdylib crate) via `bun:ffi` dlopen.
 * Every accessor is failure-tolerant: when the binary is missing, the
 * platform is unsupported, or dlopen/version checks fail, the loader
 * reports the module as unavailable so callers fall back to the pure-TS
 * implementation. This is the *integration sample* for pre-compiled code:
 * no application code outside `src/native/` ever touches FFI directly.
 *
 * @module native-loader
 */

import { dlopen, FFIType, } from "bun:ffi";
import { existsSync, } from "node:fs";
import { join, } from "node:path";

/**
ABI version the loader requires (packed `(major<<16)|(minor<<8)|patch`).
*/
const REQUIRED_ABI_VERSION = (0 << 16) | (3 << 8);

/**
Platform → shared-library filename, matching the Rust crate output name.
*/
const BINARY_NAMES: Record<NodeJS.Platform, string | undefined> = {
  linux: "libloop_lore_native.so",
  darwin: "libloop_lore_native.dylib",
  win32: "loop_lore_native.dll",
  // Unsupported platforms deliberately resolve to undefined → fallback.
  aix: undefined,
  android: undefined,
  freebsd: undefined,
  haiku: undefined,
  openbsd: undefined,
  sunos: undefined,
  netbsd: undefined,
  cygwin: undefined,
};

/**
FFI symbol definitions — must match the Rust ABI contract in lib.rs.
*/
const SYMBOLS = {
  ll_version: { args: [] as never[], returns: FFIType.i32, },
  ll_blake3: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64,],
    returns: FFIType.i32,
  },
  ll_zstd_compress: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64, FFIType.i32,],
    returns: FFIType.i32,
  },
  ll_zstd_decompress: {
    args: [FFIType.ptr, FFIType.u64, FFIType.ptr, FFIType.u64,],
    returns: FFIType.i32,
  },
  ll_zstd_decompress_bound: {
    args: [FFIType.ptr, FFIType.u64,],
    returns: FFIType.i64,
  },
} as const;

export interface NativeBlake3Symbols {
  /**
  Packed ABI version.
  */
  ll_version(): number;
  /**
  Blake3 into a caller buffer. 0 = success, -1 = bad args.
  */
  ll_blake3(data: Uint8Array, len: number, out: Uint8Array, outLen: number,): number;
}

export interface NativeZstdSymbols {
  ll_zstd_compress(data: Uint8Array, len: number, out: Uint8Array, outLen: number, level: number,): number;
  ll_zstd_decompress(data: Uint8Array, len: number, out: Uint8Array, outLen: number,): number;
  ll_zstd_decompress_bound(data: Uint8Array, len: number,): number | bigint;
}

/**
Resolved native module state (lazy, cached after first load attempt).
*/
let cachedModule: { handle: NativeBlake3Symbols & NativeZstdSymbols; version: number } | null | undefined;

/**
 * Locate the shared library for the current platform/arch.
 *
 * Resolves against the repo's in-tree release target dir
 * (`native/loop-lore-native/target/release/`). Relative to the repo root so
 * the sample works from any cwd — `import.meta.dir` points at
 * `src/native/`, so `../..` lands on the repo root.
 *
 * @returns Absolute path to the binary, or null when this platform is unsupported.
 */
export function resolveNativeBinaryPath(): string | null {
  const fileName = BINARY_NAMES[process.platform];
  if (fileName === undefined) {
    return null;
  }
  const repoRoot = join(import.meta.dir, "..", "..",);
  const debugCandidate = join(
    repoRoot,
    "native",
    "loop-lore-native",
    "target",
    "debug",
    fileName,
  );
  const releaseCandidate = join(
    repoRoot,
    "native",
    "loop-lore-native",
    "target",
    "release",
    fileName,
  );
  return existsSync(releaseCandidate,) ? releaseCandidate : debugCandidate;
}

/**
 * Attempt to load the native module. Result is cached; subsequent calls are
 * cheap. Never throws — failures degrade to `null` (fallback path).
 *
 * @returns The dlopen handle + verified ABI version, or null when
 *   unavailable (missing binary, wrong platform, version mismatch, dlopen error).
 */
export function getNativeModule(): { handle: NativeBlake3Symbols & NativeZstdSymbols; version: number } | null {
  if (cachedModule !== undefined) {
    return cachedModule;
  }

  const binaryPath = resolveNativeBinaryPath();
  if (binaryPath === null || !existsSync(binaryPath,)) {
    cachedModule = null;
    return cachedModule;
  }

  try {
    const { symbols, } = dlopen(binaryPath, SYMBOLS as any,);
    const handle = symbols as unknown as NativeBlake3Symbols & NativeZstdSymbols;
    const version = handle.ll_version();
    if (version !== REQUIRED_ABI_VERSION) {
      // ABI drift — refuse the binary rather than misbehave silently.
      cachedModule = null;
      return cachedModule;
    }
    cachedModule = { handle, version, };
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/**
 * True when the native binary is loaded and ABI-verified.
 *
 * @returns Whether native BLAKE3 is available.
 */
export function isNativeAvailable(): boolean {
  return getNativeModule() !== null;
}

/**
 * Current native module status for diagnostics (health probe / telemetry).
 *
 * @returns A stable, serializable status object.
 */
export function getNativeStatus(): {
  available: boolean;
  implementation: "rust" | "none";
  version?: number;
  binaryPath?: string;
  platform: NodeJS.Platform;
} {
  const module = getNativeModule();
  return {
    available: module !== null,
    implementation: module === null ? "none" : "rust",
    version: module?.version,
    binaryPath: resolveNativeBinaryPath() ?? undefined,
    platform: process.platform,
  };
}
