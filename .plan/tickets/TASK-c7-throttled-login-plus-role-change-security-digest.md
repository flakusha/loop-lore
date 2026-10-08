<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: C7: Throttled login plus role-change security digest

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-frontend-login
**Tags:** composition, matrix-c7

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** Small
**Summary:** 02-#4 login alerts (welcome-back, repeated-failure) and 02-#5 role-change notices share one throttled digest path -- a brute-force run yields one digest, not N notices.
**Context:** Composes B11 (handleLogin, src/routes/auth/login.ts:37; role-change audit site, src/routes/admin/users.ts:146-191) + B1 (notifySystem) + B8 (backoff/quiet-hours throttling). Phase-1 slice: login.ts + users.ts + triggers.ts. Score 3 (V3/E1/R2/U0), band next. R=2 auth-route touch, auth-adjacent per R05-F2. Next-wave only, never the 0.1.0 tag.
**Acceptance Criteria:** login alerts and role-change notices share one digest path; brute-force run yields one digest; throttling reuses B8 backoff shape; bun run check green.
**Parents:** 02-#4 (login alerts) x 02-#5 (FB12 role-change notify) composed plus B8 timing.
**Depends:** FB8 ticket and FB12 ticket (sibling agent fileA parallel filing) -- the two 02 trigger sources this digest composes.
**X-map:** no 03-X parent (pure 02x02 composition); R05 FB9 coverage note acknowledged (gallery gates B10 cited directly to gallery.ts, not via 02).
**Related:** Reuses the notifySystem audit-to-notice shape from TASK-c1-moderation-action-notices-with-actor-thumb -- land C1 first. FB9 gallery gates consulted for avatar-bearing payloads.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
