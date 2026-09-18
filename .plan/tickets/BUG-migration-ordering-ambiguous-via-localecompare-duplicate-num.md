<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Migration ordering ambiguous via localeCompare + duplicate numeric prefixes

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Closed — fixed in worktree find-work-batch-tickets (verified 2026-09-18)

## Resolution

1. **`src/db/migrate.ts`**: replaced `localeCompare` with a numeric-aware
   comparator (`compareMigrationNames`) that orders by leading `NNN_`
   prefix numerically, then alphabetically for ties. Exported so tests
   can reuse it.
2. **`src/db/migrate.ts`**: tightened filter from `*.ts minus *.test.ts`
   to strict `/^(\d{3})_(.+)\.ts$/`, so stray helpers, README siblings,
   and dotfiles can no longer register as migrations.
3. **`src/db/migrations.test.ts` + `src/db/migration-roundtrip.test.ts`**: updated
   to use the same filter + comparator, so the loader and the tests
   stay in sync.
4. **`scripts/check-migration-ordering.ts`** (new gate, registered as
   `migrations - ordering` in `scripts/check-parallel.mjs`): enforces
   unique prefixes in the loader scope, surfaces stray files, and
   re-checks order stability under the numeric comparator.

**Verification**: `bun run scripts/check-migration-ordering.ts` PASSED;
`bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts`
50/50 pass; `bun run typecheck` green.
**Priority:** high
**Effort:** Medium

## Summary

src/db/migrate.ts:26 — migration apply order uses localeCompare on filename; duplicate prefixes 041_*, 054_*, 057_*make pair order alphabetical/ambiguous. Fix: enforce unique numeric prefixes (gate) and sort numerically. Related minors: readdirSync picks up stray .ts files (filter /^\d{3}_.*\.ts$/); numbering gap at 061; down() policy undocumented for migrations >=010.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
