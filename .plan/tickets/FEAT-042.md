<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-042: Content versioning framework

**Status:** ✅ Resolved (already on dev, 2026-09-20)
**Priority:** medium
**Effort:** Medium
**Summary:** Registry + batch runner for `data_version` columns.
**Context:** Epic `epic-content-hashing-distributed-integrity`; see `.plan/tickets/TASK-middleware-migration-compaction-data-version-hash.md`.
**Acceptance Criteria:**
- [x] `registerContentVersion(table, dataVersion, columns)` exported.
- [x] `runBatchRefresh(database, table, opts)` updates `record_hash` only when stale.
- [x] Unit tests cover registry + envelope + batch runner.

**Status**: open
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**:
**Related**:

Git issue: `4538afb`

## Resolution

Already implemented on dev. Verified 2026-09-20 against dev HEAD `416578e63`:

- `src/db/content-version.ts:49` — `registerContentVersion(table, dataVersion, columns)` registry primitive (idempotent; throws on duplicate `(table, v)` with different columns).
- `src/db/content-version.ts:94` — `getContentEnvelope(table, row)` builds the canonical JSON envelope at the row's `data_version` projection.
- `src/db/content-version.ts:119` — `computeRowHash(table, row)` wraps envelope + `computeRecordHash`.
- `src/db/content-version.ts:149` — `runBatchRefresh(database, table, opts)` batch runner: streams rows in `batchSize`-sized pages, skips rows with unknown projections, only writes when the recomputed hash differs from `record_hash`.
- `src/db/content-version.test.ts` — 17 tests covering registration idempotency + casing normalization, envelope projection, hash determinism, batch refresh with stale + skipped rows, and the `dataVersion` filter. `bun test src/db/content-version.test.ts` → `17 pass, 0 fail`.
- `data_version` columns added by migrations (`src/db/migrations/parts/001_core.ts`, `002_assets.ts`, `003_worlds.ts`, `005_characters.ts`, `006_chat.ts`) — schema side in place; the registry is consumed by feature-level writers that opt in via `registerContentVersion`.
- Cross-reference: `TASK-db-content-versioning-snapshot-restore.md` is already ✅ Resolved.

No code change required.
