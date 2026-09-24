<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Coverage waiver: generate-route/non-stream.ts below 80 floor

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Medium
**Effort:** Medium

## Summary

non-stream.ts measures 78.2 pct line coverage under the diff-scoped gate. Uncovered set is the tool-call round loop plus telemetry/memory void-reject callbacks, exercisable only through mock.module doubles whose suites are deliberately skipped in the shared-process check gate (leak risk, see isolate-only.ts). Branch tests cover the loop under npm_lifecycle_event=test:unit (non-stream.test.ts). File became floor-visible when the branch touched it (source-chain binding). Requesting per-file waiver floor 78 until the loop is covered via injectable failover.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
