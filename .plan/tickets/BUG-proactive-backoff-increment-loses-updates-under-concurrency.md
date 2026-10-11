<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Proactive backoff increment loses updates under concurrency

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

incrementBackoff (src/chat/proactive/index.ts:181-194) does a read-then-write without a transaction or atomic increment. Concurrent calls can both read the same value and one increment is silently lost. Impact: Anti-spam backoff counter drifts higher than intended, delaying proactive messages longer than configured. Fix: Use an atomic SQL increment instead of read-modify-write.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
