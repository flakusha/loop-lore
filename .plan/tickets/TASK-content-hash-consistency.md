<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Content Hash Consistency (Hashing Migration & Schema)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Med
**Epic:** epic-non-standard-browser-crypto
**Related:** TASK-non-standard-browser-crypto-research.md (umbrella), TASK-crypto-library-research.md

## Summary

Concrete hashing-migration design and schema changes for data-consistency
hashing. Encrypted data currently relies solely on the AES-GCM auth tag; this
adds explicit content/payload hashes for assets, messages, and wrapped keys.
Library selection (BLAKE3 vs SHA-256, WASM vs native) is informed by
`TASK-crypto-library-research.md`, but this ticket owns the migration + schema
work and is independent of the research ticket (research only informs
integration design).

## Context

### Problem

Encrypted data stored in DB relies solely on AES-GCM auth tag for integrity.
Edge cases where the auth tag alone is insufficient:

- Key rotation → re-encryption changes ciphertext, old hash invalid
- Migration/backup restore → partial writes may pass GCM check
- Storage bit-flip → GCM catches most but not all corruption patterns
- Concurrent clobber → two writes to same row, one lost

### Required Hashing

| Entity              | Hash Target             | Storage Column          | Verify On               | Algorithm      |
| ------------------- | ----------------------- | ----------------------- | ----------------------- | -------------- |
| Asset (plaintext)   | Original blob bytes     | `assets.content_hash`   | Download (post-decrypt) | BLAKE3/SHA-256 |
| Asset (encrypted)   | Encrypted payload       | `assets.payload_hash`   | Load (pre-decrypt)      | BLAKE3/SHA-256 |
| Message (encrypted) | `messages.content` JSON | `messages.payload_hash` | Read (pre-decrypt)      | BLAKE3/SHA-256 |
| Actor key (wrapped) | Wrapped key bytes       | `actor_keys.key_hash`   | Unwrap (pre-decrypt)    | BLAKE3/SHA-256 |

### Research Questions

1. **Algorithm**: BLAKE3 vs SHA-256? Tradeoffs: speed vs ubiquity vs WASM support
2. **Where to hash**: Browser-side (on encrypt) vs server-side (on store)?
3. **Granularity**: Per-row hash vs Merkle tree for batch verification?
4. **Migration**: How to backfill hashes on existing encrypted data?
5. **Performance**: Hash cost relative to encrypt cost? (BLAKE3: ~1GB/s, negligible)
6. **Storage**: Hash column type (TEXT hex? BLOB? fixed-width?)

### Schema Changes (Proposed)

```sql
-- Assets: dual hash (plaintext + encrypted)
ALTER TABLE assets ADD COLUMN content_hash TEXT;   -- BLAKE3 of original bytes
ALTER TABLE assets ADD COLUMN payload_hash TEXT;   -- BLAKE3 of encrypted JSON

-- Messages: encrypted payload hash
ALTER TABLE messages ADD COLUMN payload_hash TEXT; -- BLAKE3 of content JSON

-- Keys: wrapped key hash
ALTER TABLE actor_keys ADD COLUMN key_hash TEXT;   -- BLAKE3 of wrapped key bytes
```

### Flow

```
Upload:
  plaintext → hash(plaintext) → encrypt → hash(encrypted) → DB write
                                                        ↓
                                            content_hash + payload_hash stored

Download:
  DB load → verify payload_hash → decrypt → verify content_hash → serve
               ↓ mismatch                           ↓ mismatch
          return 500 + audit log              return 500 + audit log
```

## Deliverables

- [ ] **Data consistency hashing spec** — asset + message + key integrity design

## Acceptance Criteria (Hashing)

- [ ] BLAKE3 vs SHA-256 recommendation with rationale
- [ ] Browser-side hashing feasibility (BLAKE3 WASM vs native SHA-256)
- [ ] Server-side hashing integration points
- [ ] Schema migration plan for existing data
- [ ] Audit log design for hash mismatches
- [ ] Performance impact assessment
