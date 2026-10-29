<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Auth hardening: XFF trust, session cap, algo pin, derive short-circuit, logout verify

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** In Progress
**Status Note:** [2026-10-29 review-residue verification] 3 of the 5 technical acceptance criteria are met by committed dev code; 2 are NOT. MET: (1) `getClientIp` does not trust the first hop of `X-Forwarded-For` — `src/routes/auth/shared.ts:116-121` reads only the LAST (proxy-appended) entry and `:140-142` returns the connection-derived peer address when `trustProxy` is off (`80cab64e6`, `1643a079c`; tests `src/routes/auth/get-client-ip.test.ts:38` "trustProxy off → connection-derived peer wins, spoofed XFF ignored" and `:43` "trustProxy on → trusts only the proxy-appended LAST XFF entry"); (2) the session cap evicts the oldest session — `src/routes/auth/session.ts:56-64` orders by `created_at` ascending and the stale "lowest id = oldest auto-increment" comment is gone (`48f6a1acb`; test `src/routes/auth/session.test.ts:226` "evicts the session with the oldest created_at, not the lowest id"); (5) `handleLogout` verifies the session token before deleting the session — `src/routes/auth/session.ts:114-125` deletes only when `derivedUserId` and `derivedSessionId` come from the authenticated middleware (`8884a80af`; tests `src/routes/auth/session.test.ts:113`, `:144`, `:177`). NOT MET: "`Bun.password.hash` uses a pinned algorithm." — `src/db/seed.ts:141`, `src/routes/auth/register.ts:143` and `src/seeding/users.ts:118` all call `Bun.password.hash(password)` with no algorithm argument. NOT MET: "`elysia-app.ts` derive short-circuits on auth failure." — `src/elysia-app.ts:107-119` returns `{ userId: null, userRole: null, sessionId: null }` on auth failure instead of short-circuiting. Git issue `a001848` stays open, matching this `In Progress` status.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-auth-access

## Summary

Medium auth gaps from review: getClientIp trusts X-Forwarded-For first hop (rate-limit bypass); Bun.password.hash uses unpinned default (spec scrypt, plan bcrypt/argon2, impl argon2id); elysia-app.ts derive does not short-circuit on auth failure (structural weakness behind /me bug); handleLogout deletes session from unverified token. Fix each per .plan/backlog/security-review-2026-08-25.md.

## Acceptance Criteria

- [x] `getClientIp` does not trust the first hop of `X-Forwarded-For` (rate-limit bypass).
- [x] The session cap evicts the **oldest** session: `src/routes/auth/session.ts:56-63` currently evicts by `id` ascending, but session ids are random UUIDs (`const sessionId = uid();`, `src/routes/auth/session.ts:45`), so the eviction is effectively arbitrary and an arbitrary session is logged out. Order by `created_at` ascending (`src/db/schema-core.ts:212` has the column) and drop the stale "lowest id = oldest auto-increment" comment.
- [ ] `Bun.password.hash` uses a pinned algorithm.
- [ ] `elysia-app.ts` derive short-circuits on auth failure.
- [x] `handleLogout` verifies the session token before deleting the session.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
