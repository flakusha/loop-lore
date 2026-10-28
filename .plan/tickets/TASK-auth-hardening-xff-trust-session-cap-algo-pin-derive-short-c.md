<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Auth hardening: XFF trust, session cap, algo pin, derive short-circuit, logout verify

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-auth-access

## Summary

Medium auth gaps from review: getClientIp trusts X-Forwarded-For first hop (rate-limit bypass); Bun.password.hash uses unpinned default (spec scrypt, plan bcrypt/argon2, impl argon2id); elysia-app.ts derive does not short-circuit on auth failure (structural weakness behind /me bug); handleLogout deletes session from unverified token. Fix each per .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [ ] `getClientIp` does not trust the first hop of `X-Forwarded-For` (rate-limit bypass).
- [ ] The session cap evicts the **oldest** session: `src/routes/auth/session.ts:56-63` currently evicts by `id` ascending, but session ids are random UUIDs (`const sessionId = uid();`, `src/routes/auth/session.ts:45`), so the eviction is effectively arbitrary and an arbitrary session is logged out. Order by `created_at` ascending (`src/db/schema-core.ts:212` has the column) and drop the stale "lowest id = oldest auto-increment" comment.
- [ ] `Bun.password.hash` uses a pinned algorithm.
- [ ] `elysia-app.ts` derive short-circuits on auth failure.
- [ ] `handleLogout` verifies the session token before deleting the session.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
