// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/transport/compression.ts — Transparent compression decorator

// Brotli has no Bun.* equivalent (Bun.zstd* covers zstd); gzip uses Bun.gzipSync.
// lean-ctx: safeFromUint8Array returns Buffer (= Uint8Array<ArrayBufferLike>),
//          but Bun.gzipSync declares the narrower `Uint8Array<ArrayBuffer>`.
//          `new Uint8Array(buffer)` rehydrates the view into the strict generic
//          the Bun types require; the underlying bytes are unchanged.
import { brotliCompressSync, brotliDecompressSync, } from "node:zlib";
import type { CompressionAlgorithm, } from "../db/enums";
import { safeFromUint8Array, } from "../utils/safe-buffer";
import type { Connection, ProtocolHandler, } from "./protocol.unified";

interface CompressionOptions {
  /** Compression level (algorithm-specific). Default varies per algo. */
  level?: number;
  /** Minimum payload size (bytes) before compression kicks in. Default 256. */
  threshold?: number;
}

function strictUint8(buf: Buffer,): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buf,);
}

/**
 * Compress outgoing data using the specified algorithm.
 */
function compress(
  data: Uint8Array,
  algorithm: CompressionAlgorithm,
  options: CompressionOptions,
): Uint8Array {
  if (data.byteLength < (options.threshold ?? 256)) {
    return data;
  }

  if (algorithm === "none") {
    return data;
  }

  // Use safeBuffer for size validation
  const bufferResult = safeFromUint8Array(data,);
  if (!bufferResult.ok) {
    throw bufferResult.error;
  }
  const buffer = bufferResult.buffer;
  const strictIn = strictUint8(buffer,);

  switch (algorithm) {
    case "zstd": {
      return new Uint8Array(
        (Bun.zstdCompressSync as (buf: Buffer, opts?: { level?: number },) => Buffer)(buffer, {
          level: options.level,
        },),
      );
    }

    case "br": {
      return new Uint8Array(
        brotliCompressSync(buffer, {
          params: {
            1: options.level ?? 6, // BROTLI_PARAM_QUALITY
          },
        },),
      );
    }

    case "gzip": {
      return new Uint8Array(
        Bun.gzipSync(strictIn, { level: (options.level ?? 6) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, },),
      );
    }
  }
}

/**
 * Decompress incoming data using the specified algorithm.
 */
function decompress(data: Uint8Array, algorithm: CompressionAlgorithm,): Uint8Array {
  if (algorithm === "none") {
    return data;
  }

  // Use safeBuffer for size validation
  const bufferResult = safeFromUint8Array(data,);
  if (!bufferResult.ok) {
    throw bufferResult.error;
  }
  const buffer = bufferResult.buffer;
  const strictIn = strictUint8(buffer,);

  switch (algorithm) {
    case "zstd": {
      return new Uint8Array((Bun.zstdDecompressSync as (buf: Buffer,) => Buffer)(buffer,),);
    }

    case "br": {
      return new Uint8Array(brotliDecompressSync(buffer,),);
    }

    case "gzip": {
      return new Uint8Array(Bun.gunzipSync(strictIn,),);
    }
  }
}

export interface WithCompressionOpts {
  handler: ProtocolHandler;
  algorithm: CompressionAlgorithm;
  options?: CompressionOptions;
}

/**
 * Wrap a ProtocolHandler with transparent send/receive compression.
 *
 * Outgoing data is compressed before passing to the inner handler.
 * The raw (uncompressed) handler's `connect()` metadata is extended
 * with `{ compression: algorithm }`.
 *
 * @param opts - Options object
 * @param opts.handler - Inner protocol handler to wrap
 * @param opts.algorithm - Compression algorithm to apply
 * @param opts.options - Tuning options (level, threshold)
 */
export function withCompression({ handler, algorithm, options = {}, }: WithCompressionOpts,): ProtocolHandler {
  return {
    async connect(): Promise<Connection> {
      const connection = await handler.connect();
      return { ...connection, metadata: { ...connection.metadata, compression: algorithm, }, };
    },

    async send(data: string | Uint8Array,): Promise<void> {
      const raw = typeof data === "string" ? new TextEncoder().encode(data,) : data;
      const compressed = compress(raw, algorithm, options,);
      await handler.send(compressed,);
    },

    async get(signature: string,): Promise<string> {
      return handler.get(signature,);
    },

    async close(): Promise<void> {
      await handler.close();
    },
  };
}

export { compress, type CompressionOptions, decompress, };
