import { gunzipSync, brotliDecompressSync } from "node:zlib";
import type { ContentEncoding } from "./types";

export function decodeContent(stored: string, encoding: ContentEncoding): string {
  if (encoding === "identity" || !stored) {
    return stored;
  }

  const buf = Buffer.from(stored, "base64");

  switch (encoding) {
    case "gzip": {
      return gunzipSync(buf).toString("utf8");
    }
    case "zstd": {
      const decompressed = (Bun.zstdDecompressSync as (data: Buffer) => Buffer)(buf);
      return decompressed.toString("utf8");
    }
    case "brotli": {
      return brotliDecompressSync(buf).toString("utf8");
    }
    default: {
      return stored;
    }
  }
}
