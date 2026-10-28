<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Lineage content-hash anchors

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-asset-lineage-provenance
**Tags:** assets, lineage
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Use the existing assets.content_hash (unique, dedup-enforced since migration 030) as the identity anchor for provenance rows; reuse it, add no second hash. AC: lineage rows reference content_hash without re-hashing; duplicate-suggestion reads consume the same hash.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
