/**
 * DB Schema Enums — Content & Assets
 *
 * Content encoding, asset types, storage backends.
 */

// ── Content Encoding ──────────────────────────────────────
export const ContentEncoding = {
  Identity: "identity",
  Gzip: "gzip",
  Zstd: "zstd",
  Brotli: "brotli",
} as const;
export type ContentEncoding = (typeof ContentEncoding)[keyof typeof ContentEncoding];

// ── Assets ────────────────────────────────────────────────
export const AssetType = {
  Image: "image",
  Audio: "audio",
  Video: "video",
  Memory: "memory",
  Other: "other",
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const StorageBackend = {
  Local: "local",
  S3: "s3",
  Gcs: "gcs",
} as const;
export type StorageBackend = (typeof StorageBackend)[keyof typeof StorageBackend];
