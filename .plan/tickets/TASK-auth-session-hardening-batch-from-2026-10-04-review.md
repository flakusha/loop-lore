<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Auth/session hardening batch from 2026-10-04 review

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Six MINOR verified gaps, one batch: (1) username enumeration - unknown user -> instant 401 (no hash), disabled user -> 403 BEFORE password verify, wrong password -> ~100ms bcrypt (src/routes/auth/login.ts:76-108); fix with dummy-hash verify + verify-before-status-gate + single generic 401. (2) Session-cap eviction arbitrary - sessions.id is a random uuid (src/utils.ts:40) so orderBy('id','asc') (src/routes/auth/session.ts:55-62) evicts a random session; use created_at and evict count-maxSessions rows. (3) Unparseable session expires_at treated as valid (src/middleware/auth/authenticate.ts:87-96) while sessions-switch.ts:48-52 deletes the same shape as expired - mirror the expiry behavior. (4) Session list swallows DB failures via Promise.allSettled and returns 200 empty (src/routes/sessions.ts:100-118) - let failures 500. (5) Logout clear-cookie omits Secure that setTokenCookie applies in production (src/routes/auth/session.ts:125-130 vs shared.ts:80-106) - reuse the setTokenCookie matrix. (6) No password max length before bcrypt hash (src/routes/auth/register.ts:116-125; bcrypt truncates ~72 bytes) - cap at e.g. 128. Overlaps open ticket a001848 (session-cap/algo items) - coordinate.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
