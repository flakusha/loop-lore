<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Chat SSE shares generation rate bucket

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-api-rate-limiting

**Resolution:** `src/api-governance/rate-limiting/policies.ts` — `[/api/v1/generation/stream, chatPolicy]` prefix exception placed ABOVE the `/api/v1/generation` prefix (first-match wins; suffix can't match a trailing chatId). Regression test pins stream→chat, image→generation. 25 pass.
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

GET /api/v1/generation/stream/:chatId falls in the generation bucket — 20/min burst 5 (policies.ts:28). ~5 chat turns/reconnects per minute exhaust the LLM/image budget. Stream reads should not consume generation quota. Evidence: .tmp/interaction-cycles.md ## Chat turn. Epic: epic-interaction-surfaces-audit.

**Context:**
Chat SSE is a read stream, not a generation spend; sharing the bucket couples chat liveness to image/LLM quota.

**Acceptance Criteria:**
- [ ] Implementation complete

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
