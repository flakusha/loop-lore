// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe compression/decompression with ratio limits (zip bomb protection).
 */
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync, } from "node:zlib";
import { DEFAULT_MAX_RATIO, DEFAULT_MAX_SIZE, } from "./constants";
import type { BufferResult, CompressionAlgorithm, } from "./types";

/**
 * Safely decompress data with compression ratio limits (zip bomb protection).
 *
 * Decompresses synchronously, then enforces post-decompression bounds
 * (maxSize + maxRatio) to detect zip-bomb expansion. The compressed-size
 * itself is NOT pre-checked: dense payloads (e.g. long base64 strings,
 * high-entropy ciphertext) can compress poorly and exceed
 * `maxSize / maxRatio` bytes while still being safe — pre-rejecting them
 * causes silent garbage reads downstream (see BUG-safedecompress-pre-check).
 * @param data - Compressed data as Buffer
 * @param algorithm - Compression algorithm
 * @param maxSize - Maximum decompressed size in bytes (default: 10 MB)
 * @param maxRatio - Maximum compression ratio (default: 1000x)
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
