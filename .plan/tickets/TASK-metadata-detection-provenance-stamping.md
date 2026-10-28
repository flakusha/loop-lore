<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Metadata detection provenance stamping

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-asset-generation-metadata
**Tags:** assets, metadata
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Stamp every metadata parse result with a _detection_method field recording which parser tier produced it, so consumers know the evidence strength. AC: every recovered fact row carries a detection method; results from different tiers are distinguishable in the read API.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
