<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guest rate limiting + audit logging for guest reads

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-guest-access

**Summary:**

## Problem

Rate limiting is per-route on auth routes only (src/routes/auth/shared.ts); guest reads are unthrottled and unaudited, so open-public endpoints are abuse/exposure vectors.

## Change

- Per-IP sliding-window limiter for guest-context read routes (reuse src/middleware/rate-limit.ts shape), configurable via config (guest read limit + window).
- Audit log rows for guest reads: userRole=guest + request id + route + target id; no invented identity.
- NSFW gate keeps denying anonymous (no guest-tier policy in this epic).
- Full token-bucket subsystem stays in epic-api-governance.md.

## Acceptance

- Guest reads beyond the per-IP limit get 429 with retry-after.
- Audit rows written for guest reads (log_entries or equivalent).
- Registered-user reads unaffected.
- NSFW gate still denies guest.

**Context:**

Guest reads are open-public and unthrottled: rate limiting existed only per-route
on auth routes (`src/routes/auth/shared.ts`) and telemetry. Phase 4 reuses those
building blocks — the shared sliding-window limiter (`src/middleware/rate-limit.ts`),
the per-IP bucket key (`getClientIp`, `server.trustProxy`-aware) and the
content-negotiated 429 envelope — instead of a new subsystem; the full
token-bucket store stays in `epic-api-governance.md`. Audit rows go to the
existing `log_entries` table in the nsfw-gate logging shape; no new identity,
table, or migration. The path gate reuses the central null-userId guard's
`GUEST_READ_SHAPES` (exported matcher) so limiter and allowlist cannot drift.

**Status Notes:**

- Slice 1 (guest per-IP read limiter): `src/middleware/guest-rate-limit.ts`
  (`createGuestReadLimiter`, wired in `src/elysia-app.ts` right after
  `requireAuthGuard`), config `auth.guestReadLimit`/`auth.guestReadWindowSec`
  (defaults 60 / 60s, env `AUTH_GUEST_READ_LIMIT`/`AUTH_GUEST_READ_WINDOW_SEC`).
  ACs covered: "429 with retry-after" (`guest read over the limit gets 429 with
  Retry-After`, `/api/v1 reads share the /api bucket`) and "Registered-user
  reads unaffected" (`registered users are never limited`, `non-guest roles are
  never limited`, `non-GET methods do not consume budget`,
  `non-guest-read paths do not consume budget`).
- Slice 2 (audit rows): served (non-429) guest reads write one `log_entries`
  row — level 6, `event_type=guest.read`, `action=read`, `request_id` from the
  request-id derive, `user_id` stays null (no invented identity), meta
  `{ userRole, route, targetId, ip }`; insert failures are logged and swallowed
  (never fail the read). DELIBERATE DEVIATION: 429 rejections are NOT logged —
  rows count reads actually served (pinned by `429 rejections are not logged
  (rows = served reads)`). AC covered: "Audit rows written for guest reads"
  (`allowed guest read writes exactly one audit row with expected fields`,
  `registered reads write no audit rows`, `audit failure never fails the read`).
- Slice 3 (NSFW pin + e2e smoke): the deny was already pinned by
  `request-context.test.ts` "anonymous caller short-circuits to auth_required";
  added the explicit guest-tier pin ("guest tier (null userId) is denied
  regardless of derived role"). e2e smoke
  `tests/e2e/flows/guest-hardening.test.ts`: guest public-chat read under limit
  200 + exactly one audit row; over limit 429 with Retry-After, not audited;
  registered user unaffected, zero rows.

**Test totals:** `guest-rate-limit.test.ts` 14 tests,
`require-auth-guard.test.ts` + `get-client-ip.test.ts` unchanged (still green),
`request-context.test.ts` 10 tests, e2e smoke 3 tests. Scoped gates
(typecheck backend/frontend, eslint, dprint) all PASS.

**Acceptance evidence (issue ACs):**

- 429 with retry-after: `guest read over the limit gets 429 with Retry-After`
  and e2e `repeating past the per-IP limit gets 429 with Retry-After`.
- Audit rows: `allowed guest read writes exactly one audit row with expected
  fields` and e2e `guest public read under the limit succeeds and is audited`.
- Registered-user reads unaffected: `registered users are never limited` and
  e2e `registered user on the same route is unaffected and unaudited`.
- NSFW gate still denies guest: `guest tier (null userId) is denied regardless
  of derived role — Phase 4 pin`.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-10-30 registry-driven close: git issue 1d01122 (registry tip: 58a78dfbd Konstantin Fedotov Close issue)
