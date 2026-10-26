<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: giwt finalize auto-stash collides with shared-dev WIP

**Status:** Done
**Status Note:** 2026-10-26 sweep-B code verify: META pinned node_modules/giwt: merge moved to staging worktree + CAS ref move (staging.ts:7-11); dev synced lazily, never stashed (dev-restore.ts:18-19, staging-sync.ts); finalize.ts:118-121. Findings: .tmp/reviews/2026-10-26-sweep-B/BUG-giwt-finalize-auto-stash-collides-with-shared-dev-wip.md
**Priority:** medium
**Effort:** Medium
**Epic:** epic-tooling-improvement
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

giwt finalize requires a clean dev index (it auto-stashes dev state around the merge). On a shared dev checkout where several sessions leave staged/uncommitted WIP, finalization is blocked until a human cleans the index. Observed: 17 staged entries plus 4 leftover stashes (pre-finalize dev state (warn branch), pre-finalize dev state (re-stashed), etc.) on dev blocked every finalize attempt. Suggest: finalize should set dev WIP aside itself with a clear report, or fail with a recovery command that does not require bypassing the dev-checkout mutation rule.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 5748237 (registry tip: 1b79107e3 Konstantin Fedotov Close issue)
