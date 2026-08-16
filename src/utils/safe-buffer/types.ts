// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe buffer public types.
 */

/** Result of a safe Buffer operation */
export type BufferResult<T,> = { ok: true; buffer: T } | { ok: false; error: Error };

/** Supported compression algorithms */
export type CompressionAlgorithm = "gzip" | "zstd" | "brotli";
