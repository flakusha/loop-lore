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

## Review 2026-10-04

OPEN on dev - all six sub-gaps present at dev HEAD: (1) username enumeration: src/routes/auth/login.ts:76-84 unknown user -> instant 401 (no hash), :86-88 disabled -> 403 before Bun.password.verify (:100); (2) session-cap eviction: src/routes/auth/session.ts:55-62 evicts orderBy("id","asc") limit 1 but sessions.id is a random v4 UUID (src/utils.ts:40); (3) expiry-shape mismatch: src/middleware/auth/authenticate.ts:87-96 treats null/unparseable expires_at as NOT expired while src/routes/sessions-switch.ts:48-52 deletes the same shape as expired; (4) session list swallows failures: src/routes/sessions.ts:100-112 Promise.allSettled renders failed queries as rows=[]/total=0 with HTTP 200; (5) logout cookie: src/routes/auth/session.ts:125-130 hand-builds Set-Cookie without Secure while setTokenCookie applies Secure in production (src/routes/auth/shared.ts:80-106, Secure pushed at :104, production default :94); (6) password max length: src/routes/auth/register.ts:116-125 enforces only min 6, Bun.password.hash at :140 with no cap. No worktree addresses any item.
