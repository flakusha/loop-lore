<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Module-level in-memory state grows without eviction

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** runtime-memory-state-hygiene

**Summary:**

Three sites accumulate process-lifetime state with no TTL, no cap and no cleanup, so a long-running server (or a long battle) grows monotonically. The only reset helpers are test-only.

Evidence read on dev:

- src/services/agency/coordination-priority.ts:33 — module-level queuedActions array; :93 pushes without bound; drainQueuedActions at :106-117 only removes entries for a scene that is actively drained, so an abandoned scene (stream crash, client disconnect) leaks forever; __resetCoordinationState at :123-126 has zero non-test callers.
- src/utils/safe-fetch/fetch.ts:34 — external.addEventListener('abort', ..., { once: true }); when the timeout fires first the external signal never aborts, so the once-listener is never removed. Every safeFetch sharing one long-lived signal adds a permanent listener.
- src/battle/social-integration/offensive.ts:101-106 and src/battle/social-integration/support.ts:34-39,74-79 — applyMoraleModifier is called unconditionally for taunt/rally/inspire even when moraleEffect is 0, appending a no-op modifier to the array on every social action.

Source: .tmp/longcat/review-plugins-services.md H2; .tmp/longcat/review-infrastructure.md L4; .tmp/longcat/review-misc-services.md M1.

Sibling already filed separately: src/generation/continuation.ts Maps.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
