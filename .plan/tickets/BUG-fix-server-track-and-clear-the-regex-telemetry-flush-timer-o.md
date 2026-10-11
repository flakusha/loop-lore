<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: fix(server): track and clear the regex-telemetry flush timer on app stop

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** server-hardening

**Summary:**

Sources: stream-a #7. Where: src/server/init-background-services.ts:136-145 (interval created, no handle); src/elysia-app.ts:213-216 (onStop stops scheduler only). Gap: the 60s setInterval flush timer is unrefd but never tracked or cleared - onStop flushes the async store and stops the cron scheduler only, so flushes can fire after the DB is destroyed during shutdown/teardown. Acceptance: initBackgroundServices returns the timer (or a stop fn) and onStop/shutdown clears it; no post-teardown DB writes from the flush path. Priority: low - teardown-order hygiene; unrefd timer limits production impact.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
