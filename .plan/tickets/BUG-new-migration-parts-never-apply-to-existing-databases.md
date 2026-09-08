<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: New migration parts never apply to existing databases

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

Single 001_init migration is tracked as one unit by Kysely Migrator (migrateToLatest skips it once applied), so parts 019 (requested_materials column), 020 (memories_fts triggers+reshape), 021 (workflow_sessions) only ever execute on fresh databases. Long-lived DBs silently miss schema: trade code reads a missing column, memories keyword stays dead, workflow tables absent. Companion: e8f2f504 removed the column line from shipped 009_crafting (append-only violation; convergent only for fresh DBs). Fix candidates: (a) idempotent schema-backfill data-migrations via existing src/db/data-migrations runner, (b) per-part migration records.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
