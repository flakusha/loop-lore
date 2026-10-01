<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: giwt sync --fix writes an out-of-vocabulary status

**Summary:** 'giwt sync --fix' sets a closed ticket's status to lowercase 'done', which is outside the status vocabulary, so the file it just wrote fails the 'status-vocab' gate on the very next run.
**Context:** Hit while resyncing a ticket status that a sibling worktree had closed on the shared issue tracker. The same command also leaves .plan/feature-matrix.md stale, failing the 'matrix' gate. The manual recovery was: write 'Done' by hand, then regenerate the matrix.
**Acceptance Criteria:** The closed state maps onto the canonical 'Done' rather than 'done', and the feature matrix is regenerated as part of the fix pass so one command leaves plan state consistent.
**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-worktree-plan-tooling.md
**Tags:** tooling, giwt

## Summary

'giwt sync --fix' sets a closed ticket's status to lowercase 'done'. The status vocabulary is Not Started, In Progress, Blocked, Done, Wontfix, Postponed, so the file it just wrote fails the 'status-vocab' gate in 'giwt plan validate' on the very next run.

The same command also leaves .plan/feature-matrix.md stale, failing the 'matrix' gate, because it does not regenerate the matrix.

Hit while resyncing a ticket status that a sibling worktree had closed on the shared issue tracker. The fix on that branch was: write 'Done' by hand, then run 'giwt plan matrix' to regenerate.

Two asks: map the closed state onto the canonical 'Done' rather than 'done', and regenerate the feature matrix as part of the fix pass so one command leaves plan state consistent.

## Acceptance Criteria

- [x] The closed state maps onto the canonical `Done` rather than `done`
- [ ] The feature matrix is regenerated as part of the fix pass

## Partially fixed 2026-09-29 — NOT closed

The first ask is implemented upstream in `giwt`:

- `src/tickets/sync-index.ts:780` rewrites the `.md` status as
  `ms.indexStatus === "done" ? "Done" : ms.indexStatus` — the canonical
  capitalisation, not the bare index token.
- Covered by a regression test at `src/tickets/sync-issues-ops.test.ts:682`,
  "index-done .md with non-done vocabulary lines rewrites every line to
  canonical Done".

The second ask is still open. `src/commands/sync.ts` contains no reference to
`matrix`, `feature-matrix`, or `code-map`, so `giwt sync --fix` still leaves
`.plan/feature-matrix.md` stale and the `matrix` gate still fails on the next run.
Reproduced again on 2026-09-29 in loop-lore: after `bun run plan:sync:fix` the
`matrix` and `code-map - freshness` gates both failed until `giwt plan code-map`
and `giwt plan matrix` were run by hand.

Evidence that the canonical-`Done` half works: in this same session
`plan:sync:fix` rewrote `BUG-duplicate-migration-numeric-prefix-021` to `Done`
and the `status-vocab` gate passed on the following run, where it had previously
failed on a lowercase or emoji-prefixed form.
