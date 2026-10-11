<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: fix(auth): make session-expiry handling agree across authenticate() and token.ts (fail closed)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** auth-config-contracts

**Summary:**

Sources: stream-c #6. Where: src/middleware/auth/authenticate.ts:87-96 (expiresMs === null admits garbage); src/middleware/auth/token.ts:134-139,152 (?? -Infinity denies garbage). Gap: the two session-expiry checks disagree on corrupt expires_at: the live Elysia path treats unparseable expiry as not-expired while the export/SSE path denies it. (sessions.expires_at is NOT NULL, so the reachable case is a garbage string, not NULL.) Both agree on all well-formed data, so the fix is alignment, not a live exploit - but the wrong side currently serves all browser traffic. Acceptance: both paths deny on unparseable expires_at with a debug log; the token.test.ts:251 garbage-expiry case is extended to cover authenticate(). Priority: low - requires a corrupt row (DB-write access already implies compromise); alignment removes the fail-open.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
