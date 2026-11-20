<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Python discovery: interpreter candidates and cached snapshot

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Add python entry to BINARY_CANDIDATES (PATH names python3 only, plus Windows py -3 handling), src/python/discovery.ts cached snapshot mirroring src/blender/discovery.ts with injectable findBinary/probe seams, not-found yields unavailable value. Depends on TASK python bridge core for the probe shape.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
