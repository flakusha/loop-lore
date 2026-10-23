<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: BYOK store rejects non-openaiCompatible provider names

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

POST /api/user-api-keys validates only against openaiCompatible names (src/routes/api-keys.ts:82-86) — 400 Unknown provider for native anthropic/ollamaNative even though resolveProvider would accept. Fix: validate against union of openaiCompatible + anthropic + ollamaNative names.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
