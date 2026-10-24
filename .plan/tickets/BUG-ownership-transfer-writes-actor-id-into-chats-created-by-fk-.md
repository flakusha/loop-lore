<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Ownership transfer writes actor id into chats.created_by (FK users.id) → 400

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: Chat ownership transfer fails with a generic 400 'Transfer failed' whenever the target participant's actor id differs from its user id. It only works where actor.id == user.id by seeding/prod convention.

ROOT CAUSE: transferOwnership flips chats.created_by to newOwnerId — the participant ACTOR id — but chats.created_by has an FK to users.id. When actor.id != user.id the transaction dies with SQLiteError: FOREIGN KEY constraint failed and the route surfaces a generic 400 (src/chat/service/ownership.ts:230-237; src/routes/chats/ownership.ts).

FIX DIRECTION: Resolve the actor's user_id and write that to chats.created_by instead of the actor id.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
