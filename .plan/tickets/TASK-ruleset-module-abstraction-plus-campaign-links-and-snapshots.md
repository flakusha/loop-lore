<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Ruleset module abstraction plus campaign links and snapshots

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Persistent-GM pattern (open-tabletop-gm system module): ruleset abstraction over math-* D&D-ish code; shareable read-only campaign links + versioned world snapshots + player/GM roles. Builds on hosted-worlds infra, not standalone. Research: metaapp-usages mode 3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
