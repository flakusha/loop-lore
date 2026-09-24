<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Coverage waiver: stream-to-client.ts at 75.3 under check gate

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Medium
**Effort:** Medium

## Summary

stream-to-client.ts measures 75.3 pct in the diff-scoped check gate after the 685a06fe8/4b17c5bea module split: its dedicated stream-to-client.coverage.test.ts is describeOrSkipStrict-gated and skips in the shared-process check run (isolate-only.ts leak guard), so deep stream paths only count under test:unit. Pre-rebase measurement on the old base showed 99.6 with the same strict gating; dev-side refactor moved uncovered code in. Requesting per-file waiver floor 75 until the split modules regain check-gate-visible coverage or the suite is made leak-safe.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
