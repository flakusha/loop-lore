<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Skill id-scoped routes allow cross-user read/mutate (IDOR)

**Status:** Done
**Status Note:** Fixed 2026-11-04, authz-hardening lane — row-level ownership gates + negative-path tests landed on `professions-service-routes` (issue 717edfa); check:fast 14/14 PASS, targeted suites 180 pass / 0 fail
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Row-level authorization gap on the skillId-scoped routes in src/routes/rpg/skills.ts and src/routes/rpg/skills-progression.ts (branch professions-service-routes), verified line-by-line:

skills.ts:

- GET /api/rpg/skills/:id (:121-123): requireUserId only - any authenticated user can read any actor's skill.
- PUT /api/rpg/skills/:id (:142-144): requireUserId only - any authenticated user can rename/mutate any actor's skill.
- DELETE /api/rpg/skills/:id (:164-166): requireUserId only - any authenticated user can delete any actor's skill.
- GET /api/rpg/skills (list, :71-89): the ?actorId= branch (:76-79) reads any actor's skills with no ownership check; the no-actorId branch (:81-85) dumps every actor's skills in the DB to any authenticated user.

skills-progression.ts:

- POST /api/rpg/skills/:id/xp (:140-142): requireUserId only - any authenticated user can grant XP (level-ups, proficiency) to any actor's skill.
- POST /api/rpg/skills/:id/specialize (:179-181): requireUserId only - any authenticated user can specialize any actor's skill.

Actor-scoped routes ARE gated (skills-progression.ts :49, :71, :98, :121; skills.ts POST / :102), so the gap is the record-scoped set plus the list route's actor/world branches.

Fix shape: id-scoped endpoints fetch the record (svc().getSkill(id)) and check checkActorOwnership(database, skill.actorId, userId, ctx.userRole) before mutation/response, returning byte-identical 404 for missing and not-owned (actor-auth.ts requireActorAccess convention, no existence oracle); the list route gates ?actorId= via requireNsfwActorAccess (403) and scopes the world-wide listing to actors owned by the caller, with admin.character holders seeing everything (same predicate as checkActorOwnership / views/access.ts visibleCharactersTo). Negative-path tests: 401 anonymous, 404/403 authenticated non-owner, 200/201 owner - per endpoint.

**Context:**

Verification note (2026-11-04 line-by-line read): the actor-scoped skills GETs (`/actors/:actorId`, `/category/:category`, `/tree`) and `prerequisites/check` live in `skills-progression.ts` and WERE already gated via `requireNsfwActorAccess` — they are not part of the gap. The real gaps are the record-scoped routes plus the list route's two branches. Alternative considered — `requireNsfwActorAccess` (403) for the record-scoped routes was rejected in favor of the repo's id-scoped convention (byte-identical 404, no existence oracle); the list route's `?actorId=` branch keeps the actor-scoped 403 convention (`world-location-traits.ts` precedent) and the world-wide listing is owner-scoped with `admin.character` holders seeing everything (`checkActorOwnership` predicate, `views/access.ts visibleCharactersTo` precedent). No endpoint shapes/schemas changed (only the list route's response schema gained the already-possible 403).

**Acceptance Criteria:**

- [x] Implementation complete — GET/PUT/DELETE `/skills/:id` and POST `/skills/:id/xp`, `/skills/:id/specialize` fetch the skill and enforce `checkActorOwnership` on `skill.actorId` before mutation/response (byte-identical 404 for missing/not-owned); GET `/skills` gates `?actorId=` via `requireNsfwActorAccess` and scopes the cross-actor listing to the caller's own actors
- [x] Tests passing — skills.test.ts: unauthenticated access → 401 across all six surfaces; non-owner id-scoped access → 404 identical to missing; list `?actorId=` non-owner → 403; cross-actor listing hides other users' rows, owner still sees their own
- [x] Documentation updated — both `skills.ts` and `skills-progression.ts` headers now state the real per-endpoint gating (the old `skills.ts` header listed routes that live in `skills-progression.ts`)
