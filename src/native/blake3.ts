/**
 * BLAKE3 hashing — native-first, pure-TS fallback.
 *
 * Public API of the pre-compiled hot binary sample. Tries the Rust cdylib
 * (via `src/native/loader.ts`, dlopen through bun:ffi); on any failure —
 * missing binary, unsupported platform, dlopen error, ABI mismatch — the
 * pure-TS implementation (@noble/hashes) takes over with identical output.
 * Application code imports only this module; it never touches FFI.
 *
 * @module native-blake3
 */

import { BLAKE3_DIGEST_LENGTH, blake3Hash as fallbackBlake3, } from "./fallback/blake3";
import { getNativeModule, getNativeStatus, isNativeAvailable, } from "./loader";

/**
BLAKE3 digest length in bytes (256-bit output).
*/

/**
 * Which implementation is currently active (diagnostics / health probes).
 */
export type Blake3Implementation = "rust" | "ts";

/**
 * BLAKE3 hash of `data` — native (Rust cdylib) when available, else pure TS.
 *
 * @param data - Input bytes (empty input is valid).
 * @returns 32-byte BLAKE3 digest.
 * @example
 * const digest = blake3Hash(new TextEncoder().encode("abc"));
 */
export function blake3Hash(data: Uint8Array,): Uint8Array {
  const native = getNativeModule();
  if (native !== null) {
    const out = new Uint8Array(BLAKE3_DIGEST_LENGTH,);
    const status = native.handle.ll_blake3(data, data.length, out, out.length,);
    if (status === 0) {
      return out;
    }
    // ABI contract violation at runtime — never trust the binary; degrade.
  }
  return fallbackBlake3(data,);
}

/**
 * Active implementation + native status, for health probes and telemetry.
 *
 * @returns Stable, serializable status object.
 */
export function getBlake3Status(): {
  implementation: Blake3Implementation;
  nativeAvailable: boolean;
  nativeVersion?: number;
  binaryPath?: string;
  platform: NodeJS.Platform;
} {
  const status = getNativeStatus();
  return {
    implementation: status.available ? "rust" : "ts",
    nativeAvailable: status.available,
    nativeVersion: status.version,
    binaryPath: status.binaryPath,
    platform: status.platform,
  };
}

/**
 * True when the native binary is loaded and ABI-verified.
 *
 * @returns Whether native BLAKE3 is currently in use.
 */
export function isNativeBlake3Available(): boolean {
  return isNativeAvailable();
}

export { BLAKE3_DIGEST_LENGTH, } from "./fallback/blake3";
