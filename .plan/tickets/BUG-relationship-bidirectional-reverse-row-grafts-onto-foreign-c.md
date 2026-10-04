<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Relationship bidirectional reverse row grafts onto foreign characters

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Relationship creation never validates target_actor_id ownership: with is_bidirectional=true the service inserts a REVERSE row with actor_id = the OTHER user's character (src/characters/services/relationships-service/write.ts:66-84; route src/routes/character-relationships.ts:86-121) - user A grafts relationship data (type/standing/trust/metadata) onto user B's character. Nonexistent target -> FK 500 (001_init.ts:1355); self-reference unblocked. Fix: verify target exists and shares the caller's tenancy before insert; reject self-reference; also map service not-found throws (write.ts:119-123) to typed 404 instead of uncaught 500.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
