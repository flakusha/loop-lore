import { gzipSync, brotliCompressSync } from "node:zlib";
import type { ContentEncoding, EncodeResult } from "./types";

export function encodeContent(plaintext: string, encoding: ContentEncoding): EncodeResult {
  if (encoding === "identity" || !plaintext) {
    return { encoded: plaintext, encoding: "identity" };
  }

  const buf = Buffer.from(plaintext, "utf8");

  switch (encoding) {
    case "gzip": {
      const compressed = gzipSync(buf);
      return { encoded: compressed.toString("base64"), encoding: "gzip" };
    }
    case "zstd": {
      const compressed = (Bun.zstdCompressSync as (data: Buffer, opts?: object) => Buffer)(buf);
      return { encoded: compressed.toString("base64"), encoding: "zstd" };
    }
    case "brotli": {
      const compressed = brotliCompressSync(buf);
      return { encoded: compressed.toString("base64"), encoding: "brotli" };
    }
    default: {
      return { encoded: plaintext, encoding: "identity" };
    }
  }
}
