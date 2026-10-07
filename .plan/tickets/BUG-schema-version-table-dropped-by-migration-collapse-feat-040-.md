<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: schema_version table dropped by migration collapse; FEAT-040 still Done

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

The migration-collapse refactor d0d19448f deleted parts/018_schema_version.ts and src/db/schema-version.ts without folding them into 001_init.ts. On dev the schema_version table does not exist and getSchemaVersion/recordSchemaVersion accessors are gone, yet FEAT-040 still reads Done.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] New forward migration 046_schema_version.ts creates schema_version(version, applied_at, description) (append-only; do NOT edit 001_init.ts).
- [ ] src/db/schema-version.ts restored with getSchemaVersion (0 when absent) + idempotent recordSchemaVersion.
- [ ] Stale comments at 001_init.ts:4396 and the 006_rotation_history.ts / 007_add_chat_gm_role.ts references removed.
- [ ] FEAT-040 reopened to In Progress until the table is back and queryable.
- [ ] Migration roundtrip test covers up→down→up for the new migration; bun run check green.

**Related:** .plan/tickets/FEAT-040.md, src/db/migrations/README.md
