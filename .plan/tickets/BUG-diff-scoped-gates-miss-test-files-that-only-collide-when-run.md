<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Diff-scoped gates miss test files that only collide when run in the same process

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

On 2026-10-01 a review + finalize sweep over ~13 unmerged worktrees surfaced this. It was NOT a regression introduced by the sweep — it is a pre-existing condition observed while diagnosing an unrelated flaky e2e assertion. Evidenced by baseline comparison: a throwaway `git clone --shared --branch dev` at 9198f57eb passed the full 35-file browser suite 6/6, the branch worktree passed single-file 3/3, and the failing assertions also reproduced on a plan-only branch that touches nothing in `src/`.

During a finalize sweep on 2026-10-01, `giwt finalize fix-comfyui-edit-ownerid` reported 29/29 gates PASSED and `test:unit` green at 14547 tests. Yet `bun test src/image-edit/` failed reproducibly 3/3 (75 pass / 1 fail).

Cause: finalize's `test:unit` and the coverage gate are both scoped by `--diff-base` to the branch's diff, so only the changed test files ran — and they passed in isolation. The failure is order-independent and presence-based (it reproduces with the two files in either order, and passes when either file runs alone), so it can ONLY surface when the files share a process. Scoped runs therefore cannot detect it, and the branch merged with a suite that red on dev.

Related: `bun --isolate` is documented as best-effort, and per `src/db/index.ts:81-83` this belongs to the `BUG-settestdatabase-global-leak-on-test-throw` family.

Consider: have the finalize gate set include at least one unscoped run of the affected SUBSYSTEM's test directory, not only the diff's own files — so intra-directory collisions are covered while the full suite stays expensive.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
