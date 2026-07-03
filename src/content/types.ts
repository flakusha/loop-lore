export type ContentEncoding = "identity" | "gzip" | "zstd" | "brotli";

export interface EncodeResult {
  encoded: string;
  encoding: ContentEncoding;
}

export interface DecodeOptions {
  encoding: ContentEncoding;
}
