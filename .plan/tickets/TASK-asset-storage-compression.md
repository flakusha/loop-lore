# TASK: Asset Storage Compression & Encryption

**Status:** Not Started
**Priority:** Medium
**Epic:** EPIC-2026-28
**Tags:** asset, storage, compression, encryption

## Summary

Implement compression pipeline for compressible assets (JSON, text, documents) and encryption-at-rest for sensitive assets (private user uploads, business documents).

## Storage Architecture

### Current State
- Flat filesystem storage with UUID-derived paths (`raw/ab/cd/uuid.jpg`)
- No encryption — assets readable by server
- No compression — raw files stored as-is

### Future State
- Encryption-at-rest (AES-256-GCM) for private assets
- Compression pipeline (gzip/zstd/brotli) for compressible data
- Object store backend (S3/GCS) as alternative to local FS

## Requirements

### Compression Pipeline
- Detect compressible MIME types: `application/json`, `text/*`, `application/pdf`
- Apply gzip/zstd/brotli based on config
- Store compressed variant alongside original
- Serve pre-compressed variant when supported

### Encryption Pipeline
- Per-user key derivation (Argon2id)
- Asset-level encryption for private assets
- Transparent decryption on serve
- Key rotation support

### Configuration
```yaml
# Asset storage backend
ASSET_STORAGE_BACKEND: "local" | "s3" | "gcs"

# Encryption settings
ASSET_ENCRYPTION_ENABLED: true # Default false for MVP
ASSET_ENCRYPTION_PROVIDER: "user-key" | "chat-key"

# Compression settings
ASSET_COMPRESSION_ENABLED: true
ASSET_COMPRESSION_LEVEL: 6 # 1-9 for gzip, 1-22 for zstd
ASSET_COMPRESSION_MIN_SIZE: 1024 # Don't compress tiny files
```

## Implementation

1. Extend `StorageBackend` enum with `S3`, `GCS`
2. Create `src/assets/storage/backend.ts` — abstraction layer
3. Create `src/assets/storage/local.ts` — current FS implementation
4. Create `src/assets/storage/encrypted.ts` — encryption wrapper
5. Create `src/assets/storage/compressed.ts` — compression wrapper
6. Extend service to use storage abstraction

## Files
- `src/db/enums.ts` — Extend StorageBackend
- `src/assets/storage/backend.ts` — Abstraction interface
- `src/assets/storage/local.ts` — Local FS implementation
- `src/assets/storage/encrypted.ts` — Encryption wrapper
- `src/assets/storage/compressed.ts` — Compression wrapper
- `src/assets/service.ts` — Use abstraction
- `src/config/schema.ts` — Add compression/encryption config