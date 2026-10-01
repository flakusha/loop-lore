<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: createAsset content-hash dedup is a check-then-act race with no unique index

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-asset-platform-capabilities

**Summary:**

createAsset reads the dedup candidate at src/assets/service/create.ts:31-55 and inserts at create.ts:157-179 with nothing serializing the two. assets.content_hash has no unique constraint and no index — src/db/migrations/001_init.ts:424 declares the column nullable, and the only assets indexes are idx_assets_created_at, idx_assets_owner, idx_assets_record_hash (001_init.ts:469-484).

Verified 2026-10-01: 8 concurrent createAsset calls, same owner, identical bytes — 8 rows in the database, 8 distinct storage paths, 8 distinct ids returned, 0 calls reported duplicate=true. Every caller believed it created a new asset.

Two consequences: the idempotency guarantee in TASK-config-gallery-attachment-idempotent does not hold under concurrency, and 8 copies of the same bytes are written to disk.

The same check-then-act shape already has a filed precedent at BUG-flagcontent-has-toctou-race-on-duplicate-flag-check-select-t.

Fix: add a partial unique index on content_hash (WHERE content_hash IS NOT NULL, scoped to the dedup key) via a new forward migration — do not renumber or edit 001_init — and convert the path to an upsert that resolves the conflict. Per src/db/migrations/README.md, SQLite takes one ADD/DROP COLUMN per alterTable statement, but CREATE INDEX is unaffected. Note the dedup key is changing (see BUG-asset-dedup-ignores-requested-encryption-tier-and-key-return), so the index must cover the final key columns.

Acceptance: N concurrent identical uploads by one owner yield exactly 1 row; the losers return duplicate=true with the winner's id; the file is written once; the migration round-trips up->down->up under src/db/migration-roundtrip.test.ts.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
