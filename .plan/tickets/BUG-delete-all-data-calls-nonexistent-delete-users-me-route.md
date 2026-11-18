<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: delete all data calls nonexistent DELETE users me route

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Epic:** epic-frontend-settings.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Settings exposes a Delete All Data action that calls DELETE /api/v1/users/me, but the users/me route implements only GET, PUT and PATCH. The documented post-wipe redirect is also absent, so the shipped action can never succeed.

**Evidence (dev 2026-11-18):** general.ts:208-216 issues apiFetch DELETE with no redirect; src/routes/users/me.ts:28,56,106 registers only get/put/patch and grep finds no DELETE handler in the route tree; docs/frontend/settings.md:60-62 promises a wipe and redirect; BUG-settings-delete-all-data-can-never-succeed-delete-api-v1-use.md is Done via a registry-driven close with empty acceptance boxes; the browser E2E at tests/e2e/flows/browser/settings-data-actions.browser.ts:182-237 is skipped.

**Scope:** add a DELETE handler to the v1 users/me route using the existing auth extraction; delete only the caller's rows in one transaction; do not reuse the moderation admin wipe; add the post-2xx redirect and i18n error toast in the Alpine action; unskip the browser E2E.

**Acceptance Criteria:**

- [ ] authenticated owner gets 2xx and their chats, messages, participants, asset links and memories are removed
- [ ] other users rows are unchanged
- [ ] unauthenticated callers get the established auth error, not a 500
- [ ] repeated DELETE is idempotent
- [ ] browser E2E passes with E2E_SAFEGUARD=1

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
