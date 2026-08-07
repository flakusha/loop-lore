/**
 * Safe buffer public types.
 */

/** Result of a safe Buffer operation */
export type BufferResult<T,> = { ok: true; buffer: T } | { ok: false; error: Error };

/** Supported compression algorithms */
export type CompressionAlgorithm = "gzip" | "zstd" | "brotli";
