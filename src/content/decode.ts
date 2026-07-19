import { brotliDecompressSync, gunzipSync, } from "node:zlib";
import { brotliDecompressSync, gunzipSync, } from "node:zlib";
import type { ContentEncoding, } from "./types";

function zstdDecompress(data: Buffer,): Buffer {
  // zstd decompression via Bun runtime (type-safe wrapper)
  const bun = Bun as { zstdDecompressSync?: (data: Buffer,) => Buffer };
  const fn = bun.zstdDecompressSync;
  if (fn) {
    return fn(data,);
  }
  throw new Error("zstd decompression not available",);
}

export function decodeContent(stored: string, encoding: ContentEncoding,): string {
  if (encoding === "identity" || !stored) {
    return stored;
  }

  const uint8Array = Uint8Array.fromBase64(stored,);
  const buffer = Buffer.from(uint8Array,);

  switch (encoding) {
    case "gzip": {
      return gunzipSync(buffer,).toString("utf8",);
    }
    case "zstd": {
      const decompressed = zstdDecompress(buffer,);
      return decompressed.toString("utf8",);
    }
    case "brotli": {
      return brotliDecompressSync(buffer,).toString("utf8",);
    }
    default: {
      return stored;
    }
  }
}
