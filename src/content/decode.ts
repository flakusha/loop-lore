import { gunzipSync, brotliDecompressSync } from "node:zlib";
import type { ContentEncoding } from "./types";

export function decodeContent(stored: string, encoding: ContentEncoding): string {
  if (encoding === "identity" || !stored) {
    return stored;
  }

  const uint8Array = Uint8Array.fromBase64(stored);
  const buffer = Buffer.from(uint8Array);

  switch (encoding) {
    case "gzip": {
      return gunzipSync(buffer).toString("utf8");
    }
    case "zstd": {
      const decompressed = (Bun.zstdDecompressSync as (data: Buffer) => Buffer)(buffer);
      return decompressed.toString("utf8");
    }
    case "brotli": {
      return brotliDecompressSync(buffer).toString("utf8");
    }
    default: {
      return stored;
    }
  }
}
