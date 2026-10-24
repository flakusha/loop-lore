<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Settings 'Delete All Data' can never succeed — DELETE /api/v1/users/me does not exist

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SYMPTOM: The settings Data tab 'Delete All Data' button (deleteAllData() in src/frontend/alpine/settings/general.ts:246) calls DELETE /api/v1/users/me, but no such route exists: src/routes/users/me.ts mounts only GET/PUT/PATCH. The server (Elysia) answers 422 Unprocessable Entity, so the most destructive button in the app can never succeed.

EVIDENCE: Typed confirmation + native confirm + request flow exercised up to the missing endpoint (button gating works: disabled until DELETE typed, then enabled). Failing-run tail:
(fail) Settings data actions E2E > delete-all wipes the solo user's data after typed confirmation
Failed to load resource: the server responded with a status of 422 (Unprocessable Entity) [.../api/v1/users/me]

FIX DIRECTION: Implement DELETE /api/v1/users/me that wipes the solo user's data after typed confirmation, matching the client contract in deleteAllData().

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
