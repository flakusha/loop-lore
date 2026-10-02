<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness merge coordination (concerns protocol)

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** Formalize the `.tmp/concerns-*/CONCERNS.md` merge-ordering protocol: header/footer contract + finalize MUST-read rule + ledger line.
**Context:** Precedents: `.tmp/concerns-finalization/CONCERNS.md` (migration prefix collisions, generated-file collisions, source overlap) and `.tmp/concerns-branch-review/CONCERNS.md` (reparenting, MAX_MERGE_NODES truncation, fork-desync). Headers record scope/branches/dev-HEAD; footers record resolved concerns + fix commit.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Documented header contract (scope, branches, dev HEAD, timestamp) + footer contract (resolved list, fix commit) in `docs/meta/workflow.md`.
- [ ] Finalize reads its branch's CONCERNS file first and appends ledger `msg: "finalize <branch> :: read concerns-<ws>"`.
- [ ] Migration-prefix renumber protocol becomes a mechanical gate (extends `scripts/check-migration-ordering.ts`), not prose.
- [ ] `.tmp/concerns-*/` dirs deleted before merge per `.tmp/` discipline.

## Related Files

- `docs/meta/workflow.md`, `scripts/check-migration-ordering.ts`, `scripts/worktree/commands/finalize.ts`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
