<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: v1 CSRF exempt set missing /api/v1 prefixes for session-mint routes

**Summary:** `CSRF_EXEMPT_ROUTES` (src/middleware/csrf.ts:23) lists v0-only paths; the v1 migration duplicated every route under /api/v1, so /api/v1/auth/login, /api/v1/auth/register, /api/v1/demo-login, /api/v1/telemetry/event are CSRF-gated. Tests/helpers migrated to `/api/v1/...` already fail with csrf_verification_failed (cascades into 13 e2e failures).
**Context:** v0 to v1 endpoint migration (src/routes/v1/base-surface.ts:48, src/routes/v1/index.ts) duplicated authPublicRoutes. Tests moved to `/api/v1/...`; demo-login was not added to the exempt set under its v1 prefix. **Do NOT** exempt /api/v1/auth/logout (v0 logout is deliberately not exempt per BUG-logout-route-exempt-from-csrf-verification-logoff-csrf).
**Acceptance Criteria:** Add /api/v1/auth/login, /api/v1/auth/register, /api/v1/demo-login, /api/v1/telemetry/event to `CSRF_EXEMPT_ROUTES`; e2e tests in tests/e2e/helpers/client.ts:193 + tests/e2e/flows/auth.test.ts:34 stop failing at demo-login with 403 csrf_verification_failed; cascade failures in assets/auth/chat-full.assets/versioning redirects are gone.

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Labels:** security

## Summary

**Where**: `src/middleware/csrf.ts:23` (`CSRF_EXEMPT_ROUTES`).

**What**: The exempt set contains v0 paths only:

    POST /api/auth/login
    POST /api/auth/register
    POST /api/demo-login
    POST /api/telemetry/event

The `/api/v1` migration duplicated every route under a v1 prefix
(see `src/routes/v1/base-surface.ts:48` for authPublicRoutes,
`src/routes/v1/index.ts`). `decideCsrf()` keys exemptions by the
literal route pattern reported by Elysia — `/api/v1/demo-login`
never matches `/api/demo-login`, so the v1 session-mint route is
CSRF-gated. An unauthenticated client cannot satisfy the double-submit
gate (no `sessionId` to verify against), so it returns 403.

Tests/helpers already migrated to `/api/v1/...` (`tests/e2e/helpers/client.ts:193`,
`tests/e2e/flows/auth.test.ts:34`) — they fail at `demo-login` with
`csrf_verification_failed` and every downstream call loses the session,
cascading into 13 e2e failures (assets, auth, chat-full.assets,
versioning redirects).

**Fix**: Add the v1-prefixed equivalents to `CSRF_EXEMPT_ROUTES`:

    POST /api/v1/auth/login
    POST /api/v1/auth/register
    POST /api/v1/demo-login
    POST /api/v1/telemetry/event

Do NOT exempt `/api/v1/auth/logout` (v0 logout is deliberately NOT
exempt per `BUG-logout-route-exempt-from-csrf-verification-logoff-csrf`).

**Repro** (before fix):

    $ E2E_SAFEGUARD=1 bun test tests/e2e/flows/auth.test.ts -t "demo-login"
    (fail) Auth E2E > POST /api/v1/demo-login creates session and returns cookie
        POST /api/v1/demo-login  → 403 csrf_verification_failed

**Source**: gate runner dev-check 2026-09-21 (`bun run check` 3 fails).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
