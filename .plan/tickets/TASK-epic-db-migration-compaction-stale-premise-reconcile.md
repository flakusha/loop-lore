<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: epic-db-migration-compaction describes a tree that no longer exists

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-db-migration-compaction
**Tags:** db, migrations, plan-hygiene, stale-doc

**Summary:** Reconcile the compaction epic's stale tree snapshot to the operator-approved 14-file S2 baseline (122 legacy migrations → `001_core.ts` … `014_support_singletons.ts`), preserving the durable textual-generator constraint.
**Context:** `.plan/epics/` previously described a 79-file/`parts/` tree that no longer existed. The approved decision replaces append-only history with a disposable-DB S2 baseline; local DBs export → `db:reinit` → import, no shim.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Reconciled claims (2026-11-23)

| Old claim | Approved state |
| --- | --- |
| 79 files / `001_init.ts` / `076_drop_chats_visual_novel.ts` | 122 files on dev ending `122_unread_visible_counters.ts`; replaced by 14 final-form files |
| `parts/` tree and its generator parse contract | No `parts/` directory; `listMigrationFiles()` is top-level only; one inline create per table is mandatory |
| JS-injected `new Date().toISOString()` defaults, `chats.encryption_level` `'public'` | Historically stale; final DDL is derived from the retired chain and verified by the canonical golden-dump oracle |
| "delete shipped migrations" illegal under append-only | Operator-approved S2 baseline: local DBs disposable, no compatibility shim, `assertMigrationsNotStale` recovery is recreate |
| Textual `up()` extraction via non-greedy regex | Durable and load-bearing — kept in the rewritten epic |

## Fix Shape

The epic now records the 14-file baseline, one owner per table, FK-safe gapless prefixes, inline DSL only and the canonical equivalence oracle. Migration-coupled tests assert final-shape behavior. No plan doc instructs deleting applied files without the disposable-DB contract.

## Acceptance Criteria

- [x] `epic-db-migration-compaction.md` current-state numbers and paths match the 14-file baseline.
- [x] Named defect classes resolved with the canonical golden-dump comparison (final DDL matches the retired chain).
- [x] Generator-regex constraint retained (it is true and constrains any future fold).
- [x] Epic re-decided: proceed with the legal disposable-DB plan.
- [ ] `bun run plan:validate` green.

## Related

- `epic-db-migration-compaction.md`
- `TASK-backlog-migration-hygiene-duplicate-prefix-gate.md` (same tree, also describes an older shape)


git issue: 930cabe
