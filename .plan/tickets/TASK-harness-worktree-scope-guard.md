<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Harness worktree scope guard

**Status:** Done
**Status Note:** Landed on dev (`a126ab26e` confine plugin-tool path args to the worktree root + `2db1c471c` symlink-escape close, both in ancestry): `src/harness/worktree-scope.ts` + `worktree-scope.test.ts`. Path-param guard + escalation shipped as the harness slice.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Proposed src/harness/worktree-scope.ts plus an executePluginTool path-param guard: tool path parameters must resolve inside the active worktree root; cross-tree writes require an explicit request_root_change escalation instead of happening silently. Implied by the corrected rtk/lean-ctx review (harness review synthesis, .tmp/harness-review-2026-10-30).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete (`src/harness/worktree-scope.ts`; path-param guard + `request_root_change` escalation)
- [x] Tests passing (`src/harness/worktree-scope.test.ts`)
- [x] Documentation updated (Status Note records landing commits; guard semantics per ticket summary)
