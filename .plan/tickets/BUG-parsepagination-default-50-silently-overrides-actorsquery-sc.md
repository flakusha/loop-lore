<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: parsePagination default 50 silently overrides ActorsQuery schema default 20

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

parsepagination-list-fix handler reads parsePagination (default 50, http-utils/parse.ts:41) bypassing the Elysia ActorsQuery schema (validation/schemas/actors.ts:86-89, default 20). GET /api/actors without pageSize silently changes from 20 to 50 rows, contradicting the declared schema default. Clamps themselves are sane (NaN/negative/0 to 1..200, page >= 1); chats/list less exposed because ChatListQuery already validates min1/max200/default50.

Evidence: minimal-c; bun test routes/characters + chats archive/ownership 94 pass / 3 skip.

Affected: branch parsepagination-list-fix; files src/routes/characters/list.ts:24-26, src/validation/schemas/actors.ts:86-89, src/http-utils/parse.ts:41.

Fix direction: align defaults (ActorsQuery default to 50, or read clamped values from schema-validated ctx.query). Add clamp tests: /api/actors?page=abc and /api/chats?page=-1 pin clamping.

Acceptance Criteria:

- [ ] GET /api/actors without pageSize returns the declared default consistently on both layers
- [ ] clamp tests for non-numeric and negative page pin 1..200 behavior
- [ ] scoped suites green

Report: .tmp/glm-review/2026-10-21/minimal-c.md (parsepagination-list-fix).

Caveats: contract change to pagination defaults; no auth impact; no partial failure; stale-state n/a; observability unchanged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
