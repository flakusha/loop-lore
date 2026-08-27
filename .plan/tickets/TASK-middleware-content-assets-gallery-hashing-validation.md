# TASK: Content (assets, gallery, etc.) hashing + validation

**Status:** ⬜ Open
**Priority:** high
**Effort:** medium
**Epic:** epic-content-hashing-distributed-integrity (cross-cuts with `epic-frontend-gallery`)
**Issue:** TBD
**Related:**
- `src/db/migrations/016_asset_encryption.ts` (existing `assets.content_hash` — raw bytes SHA-256)
- `src/assets/service/create.ts` (current dedup lookup + insert)
- `src/frontend/gallery/` (gallery grid + preview)
- `src/routes/requests/status.ts` (worktree — `X-Record-Hash` echo)
- `TASK-middleware-fe-be-db-record-content-hashing.md` (defines `record_hash`)
- `TASK-middleware-migration-compaction-data-version-hash.md` (adds the columns)
- `TASK-asset-dedup-toctou-creates-duplicate-rows-and-orphan-files.md` (the dedup bug)
- `epic-gallery-batch-operations.md`

## Summary

Wire **end-to-end hashing + validation** for content-bearing tables:

- `assets` — SHA-256 of raw bytes (`content_hash`) + row-level
  `record_hash`. The dedup lookup is now DB-enforced by a `UNIQUE`
  constraint on `(owner_id, content_hash)` (closes the TOCTOU window
  in `create.ts:21-60`).
- `gallery` — gallery entries reference `assets` by id; gallery
  thumbnails are computed at upload and verified on serve.
- Generic **content validation hook** that any service-layer writer
  can call: `assertContentHash(table, row)` compares the in-memory
  computed hash against the persisted `record_hash` and throws
  `ContentHashMismatchError` on drift.

The hook is the building block ticket 5 uses for distributed healing.

## Acceptance Criteria

### Assets

- [ ] Migration `0xx_assets_unique_content_hash.ts` adds:

  ```sql
  CREATE UNIQUE INDEX idx_assets_owner_content_hash
  ON assets(owner_id, content_hash)
  WHERE content_hash IS NOT NULL;
  ```

- [ ] `src/assets/service/create.ts` rewrites the create flow:
  1. Stream the upload to a temp path.
  2. Compute SHA-256 of the bytes (existing util — confirm).
  3. `INSERT ... ON CONFLICT(owner_id, content_hash) DO NOTHING
     RETURNING id`. Two branches:
     a. **Row returned** (new asset): compute `record_hash` (ticket 1)
        and UPDATE the row in the same transaction. The hash depends
        on the now-known PK + columns; it must be set before COMMIT.
     b. **No row returned** (dedup hit): SELECT the existing row by
        `(owner_id, content_hash)`, recompute `record_hash` from its
        current columns, and return its id. The recompute is
        idempotent — same input ⇒ same hash — so a dedup hit never
        changes the stored hash. This is the cheap path; no UPDATE.
  4. The temp file is deleted on every exit path (success, dedup hit,
     insert failure).

- [ ] `src/routes/assets/serve.ts` (or equivalent) verifies
  `record_hash` matches before serving. If a row's hash drifts
  (e.g. file modified under the row), the route returns 409 with
  a structured error pointing the caller at the reconciliation
  endpoint (ticket 5).
- [ ] Unit + integration tests:
  - Two concurrent identical uploads → exactly one row, one file.
  - Re-uploading the same bytes returns the same asset id (idempotent).
  - Drift detection: mutate the file under the row → serve returns
    409 + `ContentHashMismatchError` shape.

### Gallery

- [ ] `src/frontend/gallery/grid.ts` (or equivalent) renders a
  thumbnail from `assets.thumbnail_path`; the serve route verifies
  the thumbnail's `record_hash` matches the asset row.
- [ ] `src/routes/gallery/batch.ts` (or equivalent) — gallery batch
  operations validate each asset's hash before bulk actions
  (delete, share, re-tag). A mismatched asset is reported in the
  batch response, not silently skipped.
- [ ] Tests:
  - Gallery grid renders thumbnails whose hash matches the row.
  - Batch delete on a drifted asset returns a per-row error, not a
    silent skip.

### Content validation hook

- [ ] New `src/content/validate.ts` exports:
  - `assertContentHash(database, table, row)` — pure check; throws
    `ContentHashMismatchError` on drift.
  - `validateContentRow(database, table, id)` — re-fetches the row,
    calls `assertContentHash`, returns `void` or throws.
  - `ContentHashMismatchError` class with `{ table, id, expected,
    actual }` fields.
- [ ] Every route that mutates a content-bearing table calls
  `validateContentRow` in the `afterHandle` hook so the post-write
  state matches the pre-write envelope.
- [ ] Unit tests in `src/content/validate.test.ts`:
  - matching row → no throw,
  - mutated row → throws with the right fields,
  - missing row → throws `NotFoundError` (not `Mismatch`),
  - disabled via opt-out flag for the offload daemon (the daemon
    legitimately mutates `request_results` without the hook firing).

## Tests

- `bun test src/assets/service/create.test.ts` — concurrency + dedup.
- `bun test src/routes/assets/serve.test.ts` — drift detection.
- `bun test src/content/validate.test.ts` — 4 cases above.
- `bun test src/frontend/gallery/` — thumbnail + batch.
- `bun run schemas:check` green.

## Out of Scope

- Encryption of asset bytes (separate ticket — `src/crypto/` is the
  home; the SMK + per-asset data key are the proposed path).
- Cross-region asset replication (separate ticket — depends on the
  asset storage backend choice).
- Content-hash-based **deduplication across owners** (current design
  scopes by `owner_id`; cross-owner dedup is a privacy decision that
  needs a separate epic).

## Notes

- The UNIQUE index on `(owner_id, content_hash)` is the dedup
  enforcement. The TOCTOU bug in `create.ts:21-60` is closed because
  the INSERT either wins (new row) or hits a constraint (existing
  row returned by `RETURNING` + fallback SELECT).
- `record_hash` (row integrity, ticket 1) is computed AFTER the
  INSERT. Drift detection compares server state to client intent; the
  client does not send `record_hash` on insert — the server is
  authoritative.
- The validation hook is intentionally cheap (single SELECT + single
  hash recompute). Profile before optimizing; the offload daemon
  bypasses it explicitly via an opt-out.
- Gallery thumbnail hashing is a future enhancement (not blocking):
  the current gallery serves `assets.thumbnail_path` directly. The
  hook validates the row; the thumbnail's own hash is a follow-up.
