<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: epic-db-migration-compaction describes a tree that no longer exists

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-db-migration-compaction
**Tags:** db, migrations, plan-hygiene, stale-doc

**Summary:** The compaction epic's "Current State" section is a snapshot of a repo state that was subsequently changed; every number, path, and both named defect classes are now wrong. A ticket that a future agent executes would delete live migration history.
**Context:** Found while reviewing the DB-split epics. AGENTS.md ranks `src/` above `docs/spec/*`; `.plan/epics/` is closer to the docs band, so a stale epic is a live trap for anyone picking up the compaction work.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Stale Claims (verified 2026-09-28)

| Epic claim | Current state |
| --- | --- |
| "79 top-level migration files ... `001_init.ts` ... `076_drop_chats_visual_novel.ts`" | 23 top-level files, ending at `022_prompt_templates_workflow_columns.ts` |
| "plus `parts/` (9 files)", "orphan `parts/009`" | `src/db/migrations/parts/` does not exist |
| "mirror the existing `parts/001-008` idiom", "preserve the generators' `parts/` parse contract" | `scripts/lib/migration-parser.ts:188-193` `listMigrationFiles()` is top-level only; no `parts/` contract to preserve |
| Defect class 1: "10 migrations bake `new Date().toISOString()`", lists migrations `029`-`044` | zero occurrences of `toISOString` in `src/db/migrations/`; those file numbers do not exist |
| Defect class 2: "orphan `parts/009_encryption_level_default.ts` meant to change `'public'`->`'none'`" | `001_init.ts:1767` already has `.defaultTo("none",)` |
| "the schema generators extract the `up()` body via non-greedy regex `...Promise<void>\s*\{([\s\S]*?)\n\}`" | correct, and load-bearing: `scripts/lib/migration-parser.ts:52-53` |
| "Delete 78 superseded top-level files" | would delete shipped, applied migrations -> `assertMigrationsNotStale` (`src/db/migrate.ts:94`) fail-fasts on every existing DB |

The regex constraint is the one durable finding and should survive into the rewritten epic. The rest is a snapshot of a tree that has since been compacted by other means.

## Fix Shape

Rewrite `epic-db-migration-compaction.md`'s Current State and Required Code/Test Changes against the real tree, and re-decide the epic: the append-only policy (`src/db/migrations/README.md`) plus `assertMigrationsNotStale` mean "delete 78 files" is not a legal option for shipped migrations without an explicit, tested data-migration story for every live database. If the remaining value is only "fewer files to read", say so; if it is none, close the epic with its one reusable finding preserved.

Do not touch migrations themselves in this ticket - it is a plan-doc reconciliation.

## Acceptance Criteria

- [ ] `epic-db-migration-compaction.md` current-state numbers and paths match the tree.
- [ ] Both named defect classes either re-confirmed against `src/` or marked resolved with evidence.
- [ ] The generator-regex constraint retained (it is true and constrains any future fold).
- [ ] Epic re-decided: proceed with a legal plan, or close with the finding preserved.
- [ ] `bun run plan:validate` green.

## Related

- `epic-db-migration-compaction.md`
- `TASK-backlog-migration-hygiene-duplicate-prefix-gate.md` (same tree, also describes an older shape)


git issue: 930cabe
