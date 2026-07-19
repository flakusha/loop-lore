import { brotliCompressSync, gzipSync } from "node:zlib";
import type { ContentEncoding, EncodeResult } from "./types";

function zstdCompress(data: Buffer): Buffer {
  // zstd compression via Bun runtime (type-safe wrapper)
  const bun = Bun as { zstdCompressSync?: (data: Buffer) => Buffer };
  const fn = bun.zstdCompressSync;
  if (fn) {
    return fn(data);
  }
  throw new Error("zstd compression not available");
}

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
      const compressed = zstdCompress(buffer);
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
