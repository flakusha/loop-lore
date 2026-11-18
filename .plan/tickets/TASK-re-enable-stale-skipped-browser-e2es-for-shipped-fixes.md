<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: re-enable stale skipped browser E2Es for shipped fixes

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-e2e-integration-testing.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Several browser tests remain skipped even though their blocking BUGs are Done and the fixes are present in code. The e2e/QA subset is the one live residue of the release tracker Missed-5 list.

**Evidence (dev 2026-11-18):** tests/e2e/flows/browser/chat-composer-interactions.browser.ts:251-258 skips impersonation toggle with a stale comment though the fix is at src/routes/chats/manage.ts:89; chat-branches.browser.ts:19-24,247-249 skips branch merge/delete though src/frontend/alpine/chat-branch-merge.ts:46-53,94-97 and the modal are shipped; memory-panel CRUD skips have Done BUGs; the delete-all skip is covered by BUG-delete-all-data-calls-nonexistent-delete-users-me-route (8d44816). Tracker line: .plan/tickets/TASK-epic-release-1-0-0.md:63.

**Scope:** remove the stale skips, update assertions to the shipped UI, and keep each spec parallel-safe. Separately record the two genuinely blocked skips (SMK secret in the browser server, chatState init to loadChats) under their existing Not-Started tickets rather than folding them into this slice.

**Acceptance Criteria:**

- [ ] previously skipped tests for shipped fixes run and pass under E2E_SAFEGUARD=1
- [ ] no assertion is weakened to make a skip removable
- [ ] remaining blocked skips reference an open ticket in a code comment
- [ ] no global state leaked between browser specs

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
