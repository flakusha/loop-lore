// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Native module layer — pre-compiled hot binary integration samples.
 *
 * Barrel exports for the BLAKE3 (hashing) + zstd (compression) modules —
 * loader + wrappers + fallbacks. Application code imports from here; the
 * FFI boundary lives in `loader.ts` and is invisible to callers.
 *
 * @module native
 */

export { BLAKE3_DIGEST_LENGTH, blake3Hash, getBlake3Status, isNativeBlake3Available, } from "./blake3";
export type { Blake3Implementation, } from "./blake3";
export { getNativeStatus, isNativeAvailable, } from "./loader";
export { DEFAULT_ZSTD_LEVEL, isNativeZstdAvailable, zstdCompress, zstdDecompress, } from "./zstd";
