<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: test debt: admin/frontend/notifications regression tests for 8 fixes

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Eight admin/frontend/notification fixes land unpinned; no admin-audit/chats/users/worlds alpine tests exist at all. Fixes map to BUG-ADMIN-ANALYTICS-TAB (05bcb6e), BUG-ADMIN-CHAT-PATCH (6888d8f), BUG-FRONTEND-NAVIGATION (24ed0d7), all Not Started.

Specs:

1. admin-analytics.test.ts: overview payload {tokensByRole:null, latencyBuckets:'junk', dailyStats:42} degrades to zeroed defaults; partial/empty overview ({}) resolves with zeroed defaults (covers both admin-analytics-crash-fix and tab-crash-fix).
2. new alpine test files for admin-audit/chats/users/worlds: empty-set page computation pinned (see D3 ticket d790244 for the no-op finding).
3. validation/schemas tests: Value.Check(AdminChatUpdateBody,{is_pinned:'yes'}) false; 'archived' true.
4. parsepagination clamps: /api/actors?page=abc and /api/chats?page=-1 (overlaps N3 ticket).
5. characters.test.ts: id 'a/b?x' asserts /character/a%2Fb%3Fx/edit and /api/v1/actors/a%2Fb%3Fx/export?format=json.
6. notifications/service.test.ts: chat with 2 actors of 1 user + 1 of another asserts 2 notifications with user ids (actor-to-user resolution + dedup); setPrefs('no-such-user') rejects User not found with no settings row written.

Evidence: minimal-a + minimal-c per-branch findings (4/131/39/8 pass respectively).

Acceptance Criteria:

- [ ] each spec added and failing-before verified
- [ ] new alpine test files exist for the four admin modules
- [ ] scoped suites green

Reports: .tmp/glm-review/2026-10-21/minimal-a.md, minimal-c.md.

Caveats: test-only; fixtures for notifications; no auth change.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
