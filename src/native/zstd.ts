// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * zstd compression — native-first, Bun-native fallback.
 *
 * Part of the pre-compiled hot binary sample set. Tries the Rust cdylib
 * (`ll_zstd_compress` / `ll_zstd_decompress` / `ll_zstd_decompress_bound`
 * via bun:ffi); on any loader failure — missing binary, unsupported
 * platform, dlopen error, ABI mismatch — falls back to Bun's built-in
 * native zstd (`Bun.zstdCompressSync` / `Bun.zstdDecompressSync`), which is
 * what the app already uses in `src/utils/safe-buffer` and the transport
 * layer. There is deliberately no pure-TS zstd: no sound implementation
 * exists, and Bun ships a native one — the fallback chain here is
 * Rust-cdylib → Bun-native.
 *
 * Determinism: a fixed `level` produces byte-identical frames — the
 * property deterministic memory/text compression relies on (stable frames
 * enable content-addressing + dedup).
 *
 * @module native-zstd
 */

import { getNativeModule, isNativeAvailable, } from "./loader";

/** zstd compression levels accepted by the native module (1–22, 0 = default). */

/** Default compression level — deterministic, good speed/ratio balance. */
export const DEFAULT_ZSTD_LEVEL = 3;

/** Worst-case overhead added to input size when sizing the output buffer. */
const ZSTD_HEADROOM = 1024;

/** Error codes mirrored from the Rust ABI (zstd.rs). */
const ERR_ARGS = -1;
const ERR_LEVEL = -4;

/** Typed view of Bun's built-in zstd (avoids unsafe casts at call sites). */
interface BunZstd {
  zstdCompressSync(data: Uint8Array, options?: { level?: number },): Uint8Array;
  zstdDecompressSync(data: Uint8Array,): Uint8Array;
}

const bunZstd = Bun as unknown as BunZstd;

/**
 * zstd-compress `data` — Rust cdylib when available, else Bun built-in.
 *
 * @param data - Input bytes (empty is valid).
 * @param level - Compression level 0–22 (default 3). Fixed level ⇒
 *   byte-identical output for the same input.
 * @returns Compressed zstd frame.
 * @throws Error when compression fails or the input is malformed.
 */
export function zstdCompress(data: Uint8Array, level: number = DEFAULT_ZSTD_LEVEL,): Uint8Array {
  const native = getNativeModule();
  if (native !== null) {
    // Worst case: zstd frames can slightly exceed the input for
    // incompressible data; headroom covers the overhead.
    const out = new Uint8Array(data.length + ZSTD_HEADROOM,);
    const status = native.handle.ll_zstd_compress(data, data.length, out, out.length, level,);
    if (status >= 0) {
      return out.slice(0, status,);
    }
    if (status !== ERR_ARGS && status !== ERR_LEVEL) {
      throw new Error(`zstd compress failed (native code ${status})`,);
    }
    // Bad args / bad level — fall through to Bun rather than fail.
  }
  return bunZstd.zstdCompressSync(data, { level, },);
}

/**
 * zstd-decompress `data` — Rust cdylib when available, else Bun built-in.
 *
 * Sizes the output buffer via `ll_zstd_decompress_bound`, so the caller
 * never needs to know the decompressed size.
 *
 * @param data - Compressed zstd frame.
 * @returns Decompressed bytes.
 * @throws Error when the frame is corrupt or decompression fails.
 */
export function zstdDecompress(data: Uint8Array,): Uint8Array {
  const native = getNativeModule();
  if (native !== null) {
    const bound = Number(native.handle.ll_zstd_decompress_bound(data, data.length,),);
    if (bound < 0) {
      throw new Error("zstd decompress failed: unknown or corrupt frame",);
    }
    const out = new Uint8Array(Math.max(bound, 1,),);
    const status = native.handle.ll_zstd_decompress(data, data.length, out, out.length,);
    if (status >= 0) {
      return out.slice(0, status,);
    }
    throw new Error(`zstd decompress failed (native code ${status})`,);
  }
  return bunZstd.zstdDecompressSync(data,);
}

/**
 * True when the native cdylib is loaded and ABI-verified (shared with the
 * BLAKE3 sample — the loader is module-agnostic).
 *
 * @returns Whether the Rust binary is currently in use.
 */
export function isNativeZstdAvailable(): boolean {
  return isNativeAvailable();
}
