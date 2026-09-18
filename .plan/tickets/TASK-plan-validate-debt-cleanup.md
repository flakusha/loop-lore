<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Plan Validate Debt Cleanup

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


## Status

[ ] open

## Priority

medium

## Effort

Large (1-3 worktrees, sweep script + section stub fills + filename renames + link fixes)

## Summary

Absorb ~9600 pre-existing `giwt plan validate` findings across 9 sub-gates on `dev` HEAD. Without this, every finalize on `dev` requires `--skip-gates 'plan:validate'`.

## Context

`plan:validate` currently fails with **12042 issues** on `dev` HEAD `80b11e372`. The 9 sub-gate breakdown:

- **format** (~3000 issues) — missing required sections: `Status:`, `Priority:`, `Effort:`, `Summary:`, `Context:`, `Acceptance Criteria:`, `Overview:` across `.plan/tickets/` and `.plan/epics/`.
- **spdx** (~6000 issues) — missing `SPDX-License-Identifier` header in `.plan/tickets/`, `.plan/epics/`, `epics-index.md`, `epics.md`.
- **links** (~600 issues) — broken file links in `.plan/epics/epic-auth-access.md` (refs `TASK-auth-register-route.md`, `TASK-two-factor-multi-factor-auth.md`).
- **naming** (7 issues) — non-conforming filenames:
  - `TASK-split-server.ts.md` (uppercase `.ts` in slug)
  - `e2e-invite-join-test.md` (no `TYPE-` prefix)
  - `gap-closure-report.md`, `invite-code-generation.md`, `join-flow-mechanics.md`, `template.md` (no prefix)
- **linkage** (3 issues) — Epic refs to non-existent files:
  - `epic-tooling.md`, `epic-frontend-modernization.md`, `epic-code-quality-and-standards.md`
- **tickets** (1 issue) — `ticket index out of sync — run giwt sync`.
- **epics-doc**, **backlog**, **code-map** — OK.

This is **pre-existing dev debt** accumulated across many PRs. Out of scope for `regression-recovery-heavy-gate-closeout` (where `plan:validate` was first diagnosed). The 3 trivial gate fixes (dprint, knip config, code-map regen) shipped separately; `plan:validate` was skipped via `--skip-gates` and punted here.

## Acceptance Criteria

- `giwt plan validate` exits 0 on `dev` HEAD.
- All 9 sub-gates green: `format`, `linkage`, `backlog`, `tickets`, `code-map`, `links`, `spdx`, `naming`, `epics-doc`.
- No new pre-existing failures introduced (each fixed file passes its gate's per-file check).
- `giwt sync` runs clean as part of the fix (resolves the `tickets` gate).
- Cleanup worktree finalizes without `--skip-gates`.

## Approach (suggested)

1. New worktree `fix/plan-validate-debt-cleanup`.
2. Bulk SPDX fix: walk `.plan/**/*.md`, prepend SPDX header if missing (one-line script, ~6000 files).
3. Bulk format fix: append stub `## Status`, `## Priority`, `## Effort`, `## Summary`, `## Context`, `## Acceptance Criteria` sections where missing. Stubs must be honest placeholders (`TBD` + author TODO) — no fabricated content.
4. Naming: rename 7 files to `TYPE-kebab-case-title.md`. Update cross-references.
5. Linkage: stub missing epic files OR rename refs.
6. Links: fix 600 broken links in `epic-auth-access.md` (find correct target files or stub them).
7. Run `giwt sync` to resolve `tickets` gate.
8. Verify locally with `giwt plan validate`; finalize clean.

## Files Touched

- `.plan/tickets/` (~600 markdown files)
- `.plan/epics/` (~15 epic files + `epics-index.md` + `epics.md`)
- `docs/frontend/` (broken-link targets)

## Out of Scope

- Filling ticket content beyond stub sections (this is bookkeeping, not content work).
- Renaming `.plan/tickets/` files to match epic linkage (separate epic-content PRs).

## Related Tickets

- `FIX-parallelize-bun-test-invocations-isolate-pins-suite-to-one-c.md` (parallel scope: bun-test invocation split).
- `TASK-coverage-gate-true-multi-worker-fanout-investigation.md` (related: heavy-gate hygiene).

## Notes

The cleanup must NOT change ticket *content* — only metadata (SPDX, sections, filenames). Any content edit is a separate ticket per file. Ponytail caveat: bulk-fix scripts that touch 600+ files are exactly the right tool for this — but verify locally with `giwt plan validate` before finalize, and review the diff hunks for stub quality.
