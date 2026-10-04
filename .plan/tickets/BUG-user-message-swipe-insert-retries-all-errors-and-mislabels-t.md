<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: User message swipe insert retries ALL errors and mislabels them 503

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

src/routes/messages/swipe-race-insert.ts:157-162 catches ALL insert errors and retries 8x, then SwipeInsertExhaustedError maps to 503 service_busy (src/routes/messages/insert-message.ts:117-124): FK/NOT NULL/DB-down failures are silently retried and mislabeled as high-concurrency. The assistant path got the correct fix (reply.ts:203-216 retries only isSwipeIndexUniqueViolation, per Done ticket 109117e) - the user path never did. Fix: gate retry on isSwipeIndexUniqueViolation(err); rethrow everything else.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - src/routes/messages/swipe-race-insert.ts:118-123 insertUserMessageWithRetry still passes isRetryable: () => true (comment explicitly notes it retries ANY error, "kept verbatim"); exhaustion maps to 503 via SwipeInsertExhaustedError (src/routes/messages/insert-message.ts); no gating on isSwipeIndexUniqueViolation for the user path. No worktree fixes it.
