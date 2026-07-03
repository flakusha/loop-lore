import { gzipSync, brotliCompressSync } from "node:zlib";
import type { ContentEncoding, EncodeResult } from "./types";

export function encodeContent(plaintext: string, encoding: ContentEncoding): EncodeResult {
  if (encoding === "identity" || !plaintext) {
    return { encoded: plaintext, encoding: "identity" };
  }

  const buffer = Buffer.from(plaintext, "utf8");

  switch (encoding) {
    case "gzip": {
      const compressed = gzipSync(buffer);
      return { encoded: Buffer.from(compressed).toBase64(), encoding: "gzip" };
    }
    case "zstd": {
      const compressed = (Bun.zstdCompressSync as (data: Buffer, options?: object) => Buffer)(buffer);
      return { encoded: Buffer.from(compressed).toBase64(), encoding: "zstd" };
    }
    case "brotli": {
      const compressed = brotliCompressSync(buffer);
      return { encoded: Buffer.from(compressed).toBase64(), encoding: "brotli" };
    }
    default: {
      return { encoded: plaintext, encoding: "identity" };
    }
  }
}
