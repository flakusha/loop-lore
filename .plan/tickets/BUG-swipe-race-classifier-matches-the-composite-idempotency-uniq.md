<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Swipe-race classifier matches the composite idempotency UNIQUE violation, so merge retries 8 times then throws

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-conversation-branching

**Summary:**

Location: src/utils/swipe-retry.ts:26 (classifier); live call site src/chat/service/merge/merge-result-rows.ts:48-52, :65.

Evidence: the text-form regex /UNIQUE constraint failed:\s*messages\.(chat_id|parent_id|swipe_index)\b/i also matches UNIQUE constraint failed: messages.chat_id, messages.idempotency_key - the exact composite message bun:sqlite emits for the idempotency index (documented at src/routes/messages/swipe-race-insert.ts:83-85; isIdempotencyUniqueViolation at :93-98 exists precisely for that case, and the classifier's own JSDoc at swipe-retry.ts:16-19 promises NOT to swallow it). merge-result-rows.ts inserts idempotency_key merge:mergeId:ordinal (:48) and classifies failures with isSwipeIndexUniqueViolation (:50-52), so a lost idempotency race during a merge is retried 8 times against an unconditionally-conflicting key, then thrown as a swipe-race error.

Verification: REPRODUCED - probe .tmp/glm-review/verify/swipe-classifier.ts imports the real isSwipeIndexUniqueViolation + retryBounded: decisive output 'classifier(composite chat_id+idempotency_key): true' (the defect), 'classifier(pure idempotency_key - must NOT): false' (the JSDoc-promised case is only half-guarded - the composite slips through), and 'retryBounded over unconditional merge conflict: attempts = 8 ok = false' - the exact loop merge-result-rows.ts:50-70 runs.

Impact: a benign idempotency replay during branch merge fails the whole merge after 8 pointless retries; mislabeled as a swipe race.

Fix: require messages.swipe_index in the matched column list (or return false when messages.idempotency_key appears anywhere in the message), and pin with the exact composite string as a test case.

Source: .tmp/glm-review/deep-integrations-1015.md F-1 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
