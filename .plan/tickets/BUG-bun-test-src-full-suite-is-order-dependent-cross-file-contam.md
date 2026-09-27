<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: bun test src full suite is order-dependent cross-file contamination

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:** Plain 'bun test src/' fails nondeterministically on dev AND review-fixes worktree while 'bun run check' coverage-gated unit mode passes: run1 worktree 80 fail (asset-preview, memory/extraction...), run2 79 fail same signature, dev 49 fail completely different set (prompt-improve, messages/guards, chat-context, export-sse) plus an entityTypes preset validation throw during makeConfig (src/config/templates-loader/validation-entity-types.ts:68 via src/routes/chat-context/handlers.test.ts:28). Isolated runs of the failing files always pass. Root cause class: process-global mock.module shadowing / leaked globals across files in one bun process (same class as BUG-export-progress-stream-test-status-assertion-is-flaky, documented there as follow-up). Fix direction: bisect the polluter files (binary search over file subsets), audit tests using mock.module without restore, consider per-file process isolation or bun --isolate; also make handlers.test fixture config satisfy the entityTypes preset validator. Verify: two consecutive 'bun test src/' runs with zero failures.
**Context:** Found 2026-09-26 during the flake review phase of the week-review orchestration: two consecutive full-suite runs in the review worktree plus one on dev; evidence and run outputs in the ticket body above.
**Acceptance Criteria:**
- [ ] Polluter files identified via subset bisection
- [ ] Contamination fixed or per-file isolation wired
- [ ] Two consecutive `bun test src/` runs report zero failures
