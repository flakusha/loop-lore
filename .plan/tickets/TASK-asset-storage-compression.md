# TASK: Asset Storage Compression & Encryption

**Status:** Not Started
**Priority:** Medium
**Epic:** epic-items
**Tags:** asset, storage, compression, encryption

## Summary

Implement compression pipeline for compressible assets (JSON, text, documents) and encryption-at-rest for sensitive assets (private user uploads, business documents).

## Storage Architecture

### Current State

- Flat filesystem storage with UUID-derived paths (`raw/ab/cd/uuid.jpg`)
- No encryption — assets readable by system users
- No compression — all assets stored at full size

### Target State

- Compression pipeline for text-based assets
- Encryption-at-rest for sensitive assets
- Transparent decompression on read
- Key management for encryption

## Requirements

### Compression Pipeline

- Detect compressible assets (JSON, text, markdown, XML)
- Compress on upload (gzip/brotli)
- Transparent decompression on read
- Compression ratio tracking

### Encryption-at-Rest

- AES-256-GCM for sensitive assets
- Key management (per-user or system-wide)
- Encrypted metadata storage
- Decryption on authorized access

### Storage Optimization

- Deduplication for identical assets
- Tiered storage (hot/warm/cold)
- Cleanup policies for orphaned assets

## Acceptance Criteria

- [ ] Compression pipeline for text-based assets
- [ ] Transparent decompression on read
- [ ] Compression ratio tracking and reporting
- [ ] Encryption-at-rest for sensitive assets
- [ ] Key management system
- [ ] Encrypted metadata storage
- [ ] Asset deduplication
- [ ] Tiered storage policies
- [ ] Unit tests for compression/encryption
- [ ] Integration tests for storage workflow

## Notes

- Reference `epic-items.md` for asset system design
- Consider compression speed vs. ratio tradeoff
- Balance security vs. performance for encryption
