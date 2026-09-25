<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Delete dead migration-helpers.ts boolToEnum

**Status:** open
**Priority:** medium
**Effort:** Small (deletion + doc fix)
**Summary:** `boolToEnum`/`batchBoolToEnum` in `src/db/migration-helpers.ts` have zero importers (verified by grep, 2026-09-25). Delete the file, fix the `docs/meta/admin-visibility-research.md` bullet, and close the stale `TASK-cleanup-banned-types` checkbox as obsolete.
**Context:** DB cleanup audit (2026-09-25, db-migration-fixes session). AGENTS.md documents these helpers as live utilities, but no migration imports them — the append-only migration policy means future boolean→enum conversions should use `INTEGER + CHECK IN (0,1)`, never temp-column rewrites.

**Acceptance Criteria:**
- [ ] `src/db/migration-helpers.ts` deleted (zero importers re-verified at deletion time).
- [ ] `docs/meta/admin-visibility-research.md` bullet referencing the helpers corrected.
- [ ] `TASK-cleanup-banned-types` stale checkbox closed as obsolete.
- [ ] Future shipped-bool policy recorded: keep `INTEGER + CHECK IN (0,1)`, no temp-col rewrite.
- [ ] `bun run check` green.

**Tags:** db, dead-code, migrations, cleanup
**Related:** src/db/migration-helpers.ts, src/db/migrations/README.md


git issue: e80c2cf
