<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: 429 responses omit Retry-After and X-RateLimit headers

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done

**Priority:** medium
**Epic:** epic-api-rate-limiting
**Effort:** Medium
**Epic:** epic-api-rate-limiting.md
**Tags:** api-rate-limiting

## Summary

src/routes/auth/login.ts (L23-31) and src/routes/auth/register.ts (L70-78) return 429 without a Retry-After header and emit no X-RateLimit-Limit/Remaining/Reset. The limiter API rate-limit.ts check() (L37) returns only boolean, so the reset time is not derivable. IMPACT: clients (incl. htmx) cannot know when to retry; violates RFC 6585 guidance for 429; no rate-limit observability. FIX: extend check() to return { allowed, retryAfterSec, limit, remaining, resetAt } (or a read-only peek). Emit Retry-After + X-RateLimit-* on both 429 and success paths.

## Acceptance Criteria

- [x] 429 on login/register/demo-login carries `Retry-After` + `X-RateLimit-Limit/Remaining/Reset` (`src/routes/auth/request.ts` `rateLimitHtml`; callers `src/routes/auth/login.ts`, `src/routes/auth/register.ts`)
- [x] Limiter exposes `limit/remaining/resetSec` via `RateLimitResult` (`consume`/`peek`/`record`/`refund` in `src/middleware/rate-limit.ts`); boolean-only `check()` off gate paths
- [x] Register skip paths refund slot: 409 duplicate-username, 422 bad form, 500 rollback cost no budget (`src/routes/auth/register.ts`)
- [x] 200 path emits no `Retry-After` (informational headers only)
- [x] `bun test src/routes/auth/login.test.ts` green incl 429-header cases (17 pass, verified in-worktree)
