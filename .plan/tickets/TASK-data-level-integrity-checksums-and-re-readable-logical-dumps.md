# TASK: Data-level integrity checksums and re-readable logical dumps

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Add checksum coverage for stored data (encrypted asset blobs, DB records) enabling corruption detection inside the live store, self-healing repair, and schema-versioned logical dumps (JSONL) as a SQLite-file-independent recovery path. Complements TASK-backup-restore-reliability-and-self-healing-for-federated-de (artifact-level snapshots); this ticket owns data-level integrity.

## Current state (reviewed)

- assets.content_hash = SHA-256 of PLAINTEXT at upload, dedup only; never verified on read/serve; cannot detect ciphertext-at-rest corruption without decrypting (src/assets/service/create.ts).
- Encrypted assets are AES-GCM per-asset subkey (src/crypto/asset-encryption.ts): tamper fails at decrypt-time only, opportunistically; no stored ciphertext digest.
- No app-level DB record/table checksums anywhere (60+ tables); no periodic integrity_check watchdog in app code (only WAL + foreign_keys pragmas).
- blake3 native module available (src/native/blake3.ts) for bulk hashing.
- Existing export route family (src/routes/export*, src/routes/export-shared/*) provides per-domain serialization conventions to reuse for dumps.

## Direction

1. Asset integrity: store ciphertext digest (blake3 or SHA-256) alongside each asset blob; verify on serve/read path (sampled or full), on scheduled sweep, and before restore import. Keep plaintext content_hash for dedup; document both.
2. DB record integrity: per-table rolling digests (blake3 over ordered rows) recorded in an integrity ledger table; scheduled audit compares live vs ledger; drift -> locate offending range via binary search over PK windows rather than per-row checksum columns (avoids 60+ table schema churn).
3. Self-healing hooks: audit failure -> quarantine evidence copy -> attempt repair from last-known-good dump/snapshot (delegates artifact machinery to TASK-backup-restore-reliability); publish verdict to the same health endpoint.
4. Logical dumps: streaming JSONL per table - first line = {schemaVersion, table, rowDigestWindow}, subsequent lines = records; deterministic ordering by PK so dumps are diffable and independently verifiable; restore validates digests line-by-line before applying. Reuse export-shared serializers where they exist.
5. Live watchdog: scheduled PRAGMA integrity_check + quick_check feeding the same verdict channel (cross-ref watchdog item in the backup ticket - single owner there, this ticket consumes verdicts).

## Acceptance criteria

- [ ] Every stored asset has a ciphertext digest persisted and verified by sweep; corrupted blob quarantined, verdict published.
- [ ] Integrity ledger table + scheduled per-table audit implemented; audit failure isolates offending PK range.
- [ ] Repair path: audited corruption triggers restore-from-good-source flow (dump or snapshot) with pre-repair quarantine copy; never auto-deletes live data.
- [ ] JSONL dump command produces schema-versioned, PK-ordered, digest-carrying output; round-trip restore from dump passes verification on a scratch DB.
- [ ] Watchdog verdicts surfaced by the backup-ticket health endpoint (no duplicate health surface).
- [ ] Cross-reference note added to TASK-backup-restore-reliability... marking this ticket owner of data-level integrity.
