/**
 * Native module layer — pre-compiled hot binary integration sample.
 *
 * Barrel exports for the BLAKE3 module (loader + wrapper + fallback).
 * Application code imports `blake3Hash` from here; the FFI boundary lives
 * in `loader.ts` and is invisible to callers.
 *
 * @module native
 */

export { BLAKE3_DIGEST_LENGTH, blake3Hash, getBlake3Status, isNativeBlake3Available, } from "./blake3";
export type { Blake3Implementation, } from "./blake3";
export { getNativeStatus, isNativeAvailable, } from "./loader";
