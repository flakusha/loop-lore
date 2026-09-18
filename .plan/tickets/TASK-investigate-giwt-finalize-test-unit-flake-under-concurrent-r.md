<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Investigate giwt finalize test:unit flake under concurrent runs

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Two consecutive `giwt finalize` runs (854b1284 and 5d67c783) failed at Step 3 `bun run test:unit` with exit 1 inside the finalize harness, but direct `bun run test:unit` immediately after passed (11536/0/1). Pattern: sibling `giwt finalize` was running concurrently, bun-test died early with ~300 bytes — same as documented `test - unit` + `coverage` OOM.

AGENTS.md says heavy test gates must serialize after light gates. `scripts/check-parallel.mjs` does this (HEAVY_NAMES list). `giwt finalize` Step 3 doesn't — it spawns `bun run test:unit` directly.

**Acceptance Criteria:**
- Reproduce: 2 concurrent `giwt finalize` on different worktrees
- Identify: OOM, parallel-job starvation, or shared-state collision (temp DB / port / /tmp lock)
- Pick cheapest fix: (a) coordinate via `.worktree-finalize.lock`, (b) lower `TEST_JOBS`, (c) wait-for-resources probe
- Verify: 3 back-to-back concurrent finalize runs all green

**Related:** scripts/check-parallel.mjs:704-718 HEAVY_NAMES pattern. Observed: cf326e28 (passed first try), 854b1284 (failed once, passed retry), 5d67c783 (failed once, passed retry)

**Context:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
