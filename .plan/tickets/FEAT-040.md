<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-040: Schema version table

**Status**: Resolved
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**:
**Related**:

Git issue: `4a5d79f`

## Resolution

Landed on dev in `70758ce7` via `schema-version-table` worktree. `parts/018_schema_version.ts` creates `schema_version(version, applied_at, description)` with backfill of parts 1–18 (builder DDL so type/manifest generators recognise it; additive only, no PRAGMA, no drops); `src/db/schema-version.ts` provides `getSchemaVersion` (0 pre-018) and idempotent `recordSchemaVersion`. `docs/spec/migrations.md` rewritten from stale stub. Verified: 4 new tests + 27 migration/roundtrip/sync tests green, tsc clean on new files.
