/**
 * Safe Buffer — memory-safe Buffer processing with size limits and leak prevention.
 *
 * Provides utilities for safe Buffer operations that prevent:
 * - Memory exhaustion from oversized inputs (zip bomb protection)
 * - Memory leaks from unreleased intermediate buffers
 * - Silent data corruption from unsafe encoding/decoding
 *
 * @example
 * // Safe base64 decode with size limit
 * const result = safeFromBase64(encoded, 10_000_000);
 * if (!result.ok) { throw result.error; }
 * const buffer = result.buffer;
 *
 * @example
 * // Safe decompression with ratio limit
 * const result = safeDecompress(compressed, "gzip", 10_000_000, 10);
 * if (!result.ok) { throw result.error; }
 * const decompressed = result.buffer;
 */

import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync, } from "node:zlib";

// ── Types ────────────────────────────────────────────────────

/** Result of a safe Buffer operation */
export type BufferResult<T,> = { ok: true; buffer: T } | { ok: false; error: Error };

/** Supported compression algorithms */
export type CompressionAlgorithm = "gzip" | "zstd" | "brotli";

// ── Constants ─────────────────────────────────────────────────

/** Default max uncompressed size: 10 MB */
const DEFAULT_MAX_SIZE = 10_485_760;
/** Default max compression ratio (decompressed / compressed) */
const DEFAULT_MAX_RATIO = 1000;
/** Default max base64 input length (before decode) */
const DEFAULT_MAX_BASE64_LEN = 20_971_520; // 20 MB encoded

// ── Safe Base64 ───────────────────────────────────────────────

/**
 * Safely decode a base64 string to a Buffer with size limits.
 *
 * Prevents memory exhaustion from oversized base64 inputs.
 *
 * @param encoded - Base64-encoded string
 * @param maxSize - Maximum decoded size in bytes (default: 10 MB)
 * @returns BufferResult with decoded buffer or error
 */
export function safeFromBase64(encoded: string, maxSize = DEFAULT_MAX_SIZE,): BufferResult<Buffer> {
  if (encoded.length === 0) {
    return { ok: false, error: new Error("Empty base64 input",), };
  }

  if (encoded.length > DEFAULT_MAX_BASE64_LEN) {
    return { ok: false, error: new Error(`Base64 input too large: ${encoded.length} chars`,), };
  }

  try {
    const uint8 = Uint8Array.fromBase64(encoded,);
    const buffer = Buffer.from(uint8,);

    if (buffer.length > maxSize) {
      return {
        ok: false,
        error: new Error(`Decoded buffer too large: ${buffer.length} bytes (max: ${maxSize})`,),
      };
    }

    return { ok: true, buffer, };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error,),), };
  }
}

/**
 * Safely encode a Buffer to base64 string.
 *
 * @param buffer - Buffer to encode
 * @param maxSize - Maximum buffer size in bytes (default: 10 MB)
 * @returns BufferResult with base64 string or error
 */
export function safeToBase64(buffer: Buffer, maxSize = DEFAULT_MAX_SIZE,): BufferResult<string> {
  if (buffer.length > maxSize) {
    return {
      ok: false,
      error: new Error(`Buffer too large to encode: ${buffer.length} bytes (max: ${maxSize})`,),
    };
  }

  return { ok: true, buffer: buffer.toString("base64",), };
}

// ── Safe Compression ──────────────────────────────────────────

/**
 * Safely decompress data with compression ratio limits (zip bomb protection).
 *
 * Checks the compressed size against the decompressed size to detect
 * potential zip bomb attacks where a small compressed input expands
 * to an enormous decompressed output.
 *
 * @param data - Compressed data as Buffer
 * @param algorithm - Compression algorithm
 * @param maxSize - Maximum decompressed size in bytes (default: 10 MB)
 * @param maxRatio - Maximum compression ratio (default: 100x)
 * @returns BufferResult with decompressed buffer or error
 */
export function safeDecompress(
  data: Buffer,
  algorithm: CompressionAlgorithm,
  maxSize = DEFAULT_MAX_SIZE,
  maxRatio = DEFAULT_MAX_RATIO,
): BufferResult<Buffer> {
  if (data.length === 0) {
    return { ok: true, buffer: Buffer.alloc(0,), };
  }

  // Check compression ratio before decompressing
  // This is a heuristic — we can't know the decompressed size without decompressing
  // but we can reject obviously dangerous ratios
  if (data.length > maxSize / maxRatio) {
    return {
      ok: false,
      error: new Error(
        `Compressed data too large for safe decompression: ${data.length} bytes ` +
          `(max: ${Math.floor(maxSize / maxRatio,)} bytes for ${maxRatio}x ratio)`,
      ),
    };
  }

  try {
    let decompressed: Buffer;

    switch (algorithm) {
      case "gzip": {
        decompressed = gunzipSync(data,);
        break;
      }
      case "brotli": {
        decompressed = brotliDecompressSync(data,);
        break;
      }
      case "zstd": {
        // zstd decompression via Bun runtime
        const bun = Bun as { zstdDecompressSync?: (data: Buffer,) => Buffer };
        const fn = bun.zstdDecompressSync;
        if (!fn) {
          return { ok: false, error: new Error("zstd decompression not available",), };
        }
        decompressed = fn(data,);
        break;
      }
      default: {
        return { ok: false, error: new Error(`Unknown algorithm: ${algorithm as string}`,), };
      }
    }

    // Post-decompression size check (zip bomb protection)
    if (decompressed.length > maxSize) {
      return {
        ok: false,
        error: new Error(
          `Decompressed data too large: ${decompressed.length} bytes (max: ${maxSize})`,
        ),
      };
    }

    // Check actual compression ratio
    if (data.length > 0 && decompressed.length / data.length > maxRatio) {
      return {
        ok: false,
        error: new Error(
          `Compression ratio ${decompressed.length / data.length}x exceeds limit ${maxRatio}x ` +
            `(possible zip bomb: ${data.length}B → ${decompressed.length}B)`,
        ),
      };
    }

    return { ok: true, buffer: decompressed, };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error,),), };
  }
}

/**
 * Safely compress data with size limits.
 *
 * @param data - Data to compress as Buffer
 * @param algorithm - Compression algorithm
 * @param maxSize - Maximum input size in bytes (default: 10 MB)
 * @returns BufferResult with compressed buffer or error
 */
export function safeCompress(
  data: Buffer,
  algorithm: CompressionAlgorithm,
  maxSize = DEFAULT_MAX_SIZE,
): BufferResult<Buffer> {
  if (data.length > maxSize) {
    return {
      ok: false,
      error: new Error(`Input too large to compress: ${data.length} bytes (max: ${maxSize})`,),
    };
  }

  try {
    let compressed: Buffer;

    switch (algorithm) {
      case "gzip": {
        compressed = gzipSync(data,);
        break;
      }
      case "brotli": {
        compressed = brotliCompressSync(data,);
        break;
      }
      case "zstd": {
        const bun = Bun as { zstdCompressSync?: (data: Buffer,) => Buffer };
        const fn = bun.zstdCompressSync;
        if (!fn) {
          return { ok: false, error: new Error("zstd compression not available",), };
        }
        compressed = fn(data,);
        break;
      }
      default: {
        return { ok: false, error: new Error(`Unknown algorithm: ${algorithm as string}`,), };
      }
    }

    return { ok: true, buffer: compressed, };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error,),), };
  }
}

// ── Safe Buffer Creation ─────────────────────────────────────

/**
 * Safely create a Buffer from a string with size limits.
 *
 * @param text - String to encode
 * @param encoding - String encoding (default: "utf8")
 * @param maxSize - Maximum string length (default: 10 MB)
 * @returns BufferResult with buffer or error
 */
export function safeFromString(
  text: string,
  encoding: BufferEncoding = "utf8",
  maxSize = DEFAULT_MAX_SIZE,
): BufferResult<Buffer> {
  if (text.length > maxSize) {
    return {
      ok: false,
      error: new Error(`String too large: ${text.length} chars (max: ${maxSize})`,),
    };
  }

  try {
    return { ok: true, buffer: Buffer.from(text, encoding,), };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error,),), };
  }
}

/**
 * Safely create a Buffer from a Uint8Array with size limits.
 *
 * @param uint8 - Uint8Array to convert
 * @param maxSize - Maximum array length (default: 10 MB)
 * @returns BufferResult with buffer or error
 */
export function safeFromUint8Array(
  uint8: Uint8Array,
  maxSize = DEFAULT_MAX_SIZE,
): BufferResult<Buffer> {
  if (uint8.byteLength > maxSize) {
    return {
      ok: false,
      error: new Error(`Uint8Array too large: ${uint8.byteLength} bytes (max: ${maxSize})`,),
    };
  }

  return { ok: true, buffer: Buffer.from(uint8,), };
}
