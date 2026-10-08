<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Persist delivered mesh payload in mesh_deliveries, not metadata only

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

receiveDelivery (src/federation/delivery.ts:55-62) writes only content_id, origin, content_hash, and clock into mesh_deliveries. The envelope is decrypted and hash-verified, then discarded - so a delivered message is not readable on the receiving instance once POST /api/mesh-deliver returns. Federation appears to succeed while delivering nothing a user can read. Add a migration for a payload column and store the decrypted content on delivery. Hash verification and the existing (clock, content_hash) LWW short-circuit must be unchanged, and a stale or duplicate envelope must not overwrite a newer payload. Assumption pending decision D3 in docs/review/federation-local-multi-instance-review.md: a separate shared-with-me surface, no FK to an existing local chat. Acceptance: after POST /api/mesh-deliver completes, the stored payload is retrievable and matches the sender plaintext by hash; the existing LWW and stale tests stay green; the migration is covered by a schema test.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
