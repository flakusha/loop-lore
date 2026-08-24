<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Rate-limit coverage expansion

**Status:** ⬜ Open
**Priority:** medium
**Effort:** Large
**Epic:** epic-api-governance
**Related:** `src/middleware/rate-limit.ts`, `epic-api-governance.md` (rate-limiting section), `src/routes/auth/shared.ts`, `src/routes/auth/login.test.ts`

## Summary

`src/middleware/rate-limit.ts` is a general-purpose in-memory sliding-window
limiter (`createRateLimiter({ windowMs, maxRequests })`), but it is currently
wired **only** to auth routes (`src/routes/auth/shared.ts`,
`src/routes/auth/login.test.ts`). The `epic-api-governance.md` rate-limiting
vision (a `src/api-governance/rate-limiting/` subsystem with token bucket,
Redis/SQLite store, per-user + per-IP limits, burst handling, dashboard) is
unbuilt, and no ticket tracked the gap between the current limiter and that
vision.

This task covers (a) broadening where the existing limiter is applied, and
(b) the longer-term governance subsystem.

## Acceptance Criteria

- [ ] Document the current limiter's contract + limitations (in-memory, per-process, not shared across workers/instances).
- [ ] Apply rate limiting to a broader set of sensitive/abusable routes (e.g., registration, message send, export) via a shared factory, not ad-hoc per route.
- [ ] Add per-user and per-IP keying options to the limiter config.
- [ ] (Phase 2) Evaluate a shared store (SQLite/Redis) so limits hold across process restarts / multiple workers.
- [ ] (Phase 2) Token-bucket algorithm + burst handling if needed by governance.
- [ ] Tests: window expiry, per-key isolation, limit hit returns 429 with `Retry-After`.
- [ ] `epic-api-governance.md` rate-limiting checklist updated to reflect what shipped vs. still planned.

## Notes

- Keep `src/middleware/rate-limit.ts` as the implementation; do NOT prematurely build the full `src/api-governance/rate-limiting/` tree unless Phase 2 is scoped.
- The login throttle already exists — extend, don't duplicate.
