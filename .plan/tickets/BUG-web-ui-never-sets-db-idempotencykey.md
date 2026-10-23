<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Web UI never sets DB idempotencyKey

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Web UI mints a fresh UUID per call (fe-fetch.ts:55-56) for the header cache only; body.idempotencyKey (create.ts:76, unique index migration 045) is never set by the Web UI — only scheduled/dispatcher.ts:146 and the merge service use it. Double-sends are never coalesced at the DB layer. Evidence: .tmp/interaction-cycles.md ## Chat turn. Epic: epic-interaction-surfaces-audit.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
