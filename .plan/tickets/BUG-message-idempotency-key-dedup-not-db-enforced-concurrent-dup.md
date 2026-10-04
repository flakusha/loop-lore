<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Message idempotency-key dedup not DB-enforced - concurrent duplicate messages

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

idx_messages_idempotency is NON-unique (src/db/migrations/001_init.ts:2151-2154) and create.ts dedups via check-then-insert (src/routes/messages/create.ts:131-163): two concurrent POSTs with one idempotencyKey both pass the check and BOTH insert - duplicate user messages (probe-demonstrated during review: 2 rows, same key). The swipe-slot unique index doesn't help; the retry path bumps swipe_index so both rows land. Fix: UNIQUE partial index on (chat_id, idempotency_key) WHERE idempotency_key IS NOT NULL; map the violation to lookup-and-return (swipe-race-insert catch pattern).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
