<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Worktree Plan Tooling — Finalize, Validation, and Ticket Hygiene

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Tooling Epic
**Tags:** tooling, giwt, worktree
**Related:** epic-testing-qa.md, epic-code-quality.md

## Summary

Harden the worktree finalize path and the plan/ticket hygiene gates:
giwt finalize lock/GPG flows, `plan:validate` gates, ticket status-enum
migration + epic-link backfill, coverage-waiver bookkeeping. Tooling-only;
no product behavior changes.

## Scope

- giwt finalize: lock retry, GPG flows, post-rebase tree gate, hook env fix.
- `plan:validate` gates: phantom-actionable fix, debt cleanup.
- Ticket hygiene: status-enum + migration of distinct values, epic-link backfill.
- Filename-slug resolution (`show-state` / plan-tickets) and untriaged sweep.
- Coverage-waiver bookkeeping for finalize tests.

## Tasks

- [ ] Finalize lock retry with jitter + post-rebase tree gate.
- [ ] GPG + isolated hook-env fixes.
- [ ] Plan-gates phantom-112 fix + `plan:validate` debt cleanup.
- [ ] Status-enum definition + migration of distinct values.
- [ ] Epic-link backfill + slug resolution.
- [ ] Untriaged advisory orphan sweep + waiver bookkeeping.

## Acceptance Criteria

- [ ] Concurrent finalize has no lock flakes; post-rebase tree gated pre-merge.
- [ ] `plan:validate` reports zero phantom actionable issues.
- [ ] Status enum enforced; all legacy values migrated.
- [ ] Every ticket links its epic; slugs resolve.
- [ ] Finalize unit tests stable under concurrency.

## Linked Tickets

| # | Ticket |
| - | ------ |
| 1 | `BUG-giwt-plan-gates-report-112-phantom-actionable-issues-when-th.md` |
| 2 | `BUG-giwt-sync-fix-writes-an-out-of-vocabulary-status.md` |
| 3 | `TASK-giwt-migration-open-items.md` |
| 4 | `TASK-giwt-show-state-resolve-plan-tickets-filename-slugs.md` |
| 5 | `FIX-add-jitter-to-the-finalize-lock-retry-backoff.md` |
| 6 | `BUG-worktree-git-helpers-pass-no-isolated-env-so-hook-context-le.md` |
| 7 | `TASK-finalize-must-gate-post-rebase-tree-before-merge.md` |
| 8 | `TASK-investigate-giwt-finalize-test-unit-flake-under-concurrent-r.md` |
| 9 | `TASK-ticket-epic-link-backfill.md` |
| 10 | `TASK-ticket-status-enum-and-migration.md` |
| 11 | `TASK-TICKET-STATUS-ENUM-MIGRATION-OF-302-DISTINCT-VALUES.md` |
| 12 | `TASK-plan-validate-debt-cleanup.md` |
| 13 | `TASK-backlog-untriaged-advisory-orphan-sweep-2026-09-25.md` |
