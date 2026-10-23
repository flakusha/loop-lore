<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Chat SSE shares generation rate bucket

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-api-rate-limiting
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

GET /api/v1/generation/stream/:chatId falls in the generation bucket — 20/min burst 5 (policies.ts:28). ~5 chat turns/reconnects per minute exhaust the LLM/image budget. Stream reads should not consume generation quota. Evidence: .tmp/interaction-cycles.md ## Chat turn. Epic: epic-interaction-surfaces-audit.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
