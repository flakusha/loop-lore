<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Profession id-scoped routes allow cross-user read/mutate (IDOR)

**Status:** Fixed (2026-11-04, authz-hardening lane) — row-level ownership gates + negative-path tests landed on `professions-service-routes` (issue b21af33); check:fast 14/14 PASS, targeted suites 180 pass / 0 fail
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Row-level authorization gap on the professionId-scoped trio in src/routes/rpg/professions.ts (branch professions-service-routes):

- GET /api/rpg/professions/:id (:114-115): requireUserId only - any authenticated user can read any actor's profession (with specializations).
- POST /api/rpg/professions/:id/xp (:135-136): requireUserId only - any authenticated user can add XP to any actor's profession, triggering level-ups and title changes.
- POST /api/rpg/professions/:id/specialize (:164-165): requireUserId only - any authenticated user can unlock specializations on any actor's profession.

Actor-scoped routes ARE gated (POST / :67, GET /actors/:actorId :92 via requireNsfwActorAccess), so the gap is exactly the record-scoped trio. An unguessable profession id is not authorization: any authenticated user can enumerate/boost another user's actor profession. The file header (:20-21) claims blanket actor-scoping - inaccurate for the trio; comment corrected in the fix commit.

Fix shape: after authN, fetch the record (svc().getProfession(id)) and check row-level ownership via checkActorOwnership(database, profession.actorId, userId, ctx.userRole) before any mutation/response, mirroring the repo's id-scoped convention (src/routes/actor-auth.ts requireActorAccess :44-48, entity-guard.ts :14-15): missing and not-owned return byte-identical 404 to avoid an existence oracle; anonymous callers get 401. Negative-path tests: 401 anonymous, 404 authenticated non-owner, 200/201 owner - per endpoint.

**Context:**

Project rule authorization-confirmed: every route checks caller identity AND permission server-side, default-deny, row-level per record; an unguessable id is not authorization (IDOR class). Alternative considered — gating via `requireNsfwActorAccess` (403) was rejected for these record-scoped routes because the repo's id-scoped convention (`actor-auth.ts` requireActorAccess, entity-guard byte-identical rule) returns 404 for both missing and not-owned to avoid an existence oracle. TOCTOU note: the ownership check reads the row before mutation; a concurrent delete still maps to 404 via the existing `errorStatus` handler.

**Acceptance Criteria:**

- [x] Implementation complete — GET /:id, POST /:id/xp, POST /:id/specialize fetch the profession and enforce `checkActorOwnership` on `profession.actorId` before any mutation/response (byte-identical 404 for missing/not-owned); file header comment now states the real per-endpoint gating
- [x] Tests passing — professions.test.ts: unauthenticated id-scoped access → 401; non-owner id-scoped access → 404 with body identical to a missing id; owner paths still 200/201
- [x] Documentation updated — route file header corrected (was claiming blanket actor-scoping)
