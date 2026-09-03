<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Open — Build Integrity Cluster

> **Filed:** 2026-09-03 (git issues `49dd182`–`7bb2bdf`, `4bc4b34`) from commits
> `25420d13` (3 BUG tickets for untracked tsc errors) + `e11f57d6` (plan-sync bug)
> + `1bc03e20` (5 refactor tickets surfaced by session-2026-09-03 bug fixes)

## Summary

Four discrete build/gate integrity issues — three untracked TypeScript errors that
surfaced in `dev` after the 154+ commit ahead window (gate was skipped during
that period), plus a plan-sync tooling bug that creates orphan git issues when
`plan:sync --fix` runs against placeholder hashes.

## Issues

| Git issue | Type | Severity | Problem | Where |
| --------- | ---- | -------- | ------- | ----- |
| `49dd182` | BUG | High | `routes/commands/index.ts:19` has unused import `t` — untracked tsc error | `src/routes/commands/index.ts` |
| `2c747e0` | BUG | High | `register-plugins:150` references undefined `chatSectionsRoutes` — untracked tsc error | `src/app/register-plugins.ts` |
| `7bb2bdf` | BUG | High | `post-store.test.ts:32` imports missing `CompleteGenerationOpts` — untracked tsc error | `src/generation/auto-gen/post-store.test.ts` |
| `4bc4b34` | BUG | Medium | `plan:sync --fix` mass-creates orphan git issues for placeholder hashes | `scripts/worktree/` plan sync tooling |

## Root Cause

The three tsc errors (`49dd182`, `2c747e0`, `7bb2bdf`) accumulated during the
154+ commit ahead window where the `bun run check` gate was skipped. They were
filed as individual BUG tickets rather than fixed ad-hoc because each represents
a distinct failure class: unused import, undefined symbol reference, and missing
type import.

The plan-sync bug (`4bc4b34`) is a tooling defect: `plan:sync --fix` should
not create orphan git issues for placeholder hashes — it should skip them.

## Acceptance Criteria

1. All three tsc errors fixed — `bun run typecheck` exit 0
2. `plan:sync --fix` does not create orphan git issues for placeholder hashes
3. `bun run check` gate green (was 18/18 before the ahead window)
4. No regression in downstream tests
