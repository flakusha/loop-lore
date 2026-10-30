<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Guest rate limiting + audit logging for guest reads

**Status:** In Progress
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

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
