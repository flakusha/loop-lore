<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(auth): make session-expiry handling agree across authenticate() and token.ts (fail closed)

**Status:** Done
**Status Note:** `src/middleware/auth/token.ts` now applies the same fail-closed rule as `authenticate.ts#verifyTokenContext`: `isSessionLive()` denies a session whose `expires_at` is missing or unparseable (the old check treated `expires_at === null` as "never expires" and only the JWT path logged the denial).
**Priority:** low
**Effort:** Medium
**Caveats:** security — a presented-but-unresolvable token is now denied instead of downgraded to the admin-equivalent solo identity, so an expired or revoked session can no longer export the archive; stale state — session liveness is re-read per request, so a session revoked mid-request still completes that request; observability — a corrupt expiry is denied and logged at debug level only, so an unexplained 401 needs the debug log to diagnose
**Epic:** epic-auth-access

**Summary:**

Sources: stream-c #6. Where: src/middleware/auth/authenticate.ts:87-96 (expiresMs === null admits garbage); src/middleware/auth/token.ts:134-139,152 (?? -Infinity denies garbage). Gap: the two session-expiry checks disagree on corrupt expires_at: the live Elysia path treats unparseable expiry as not-expired while the export/SSE path denies it. (sessions.expires_at is NOT NULL, so the reachable case is a garbage string, not NULL.) Both agree on all well-formed data, so the fix is alignment, not a live exploit - but the wrong side currently serves all browser traffic. Acceptance: both paths deny on unparseable expires_at with a debug log; the token.test.ts:251 garbage-expiry case is extended to cover authenticate(). Priority: low - requires a corrupt row (DB-write access already implies compromise); alignment removes the fail-open.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-22 registry-driven close: git issue ae8d5df (registry tip: 238ed3a2a Konstantin Fedotov Auto-closed: appended .md marker marks BUG-FIX-AUTH-MAKE-SESSION-EXPIRY)
