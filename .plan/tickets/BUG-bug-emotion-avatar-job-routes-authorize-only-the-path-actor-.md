<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: emotion-avatar job routes authorize only the path actor, so any owner can read and cancel another user's job

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

**Summary:** `src/routes/character-emotion-avatars.ts` authorizes only the actor in the URL path, then fetches or cancels a process-global in-memory job by `jobId` with no check that the job belongs to that actor.

**Context:** Found 2026-10-04 while adversarially reviewing the fix for BUG-routes-character-avatars-subdir-is-shadowed-by-flat-file-cru, which closed the same IDOR class on the sibling avatar routes. Same defect shape, different file, not fixed by that change.

The two affected handlers both do only this:
- `GET ${prefix}/actors/:actorId/emotion-avatars/jobs/:jobId` at src/routes/character-emotion-avatars.ts:54-69
- `POST ${prefix}/actors/:actorId/emotion-avatars/jobs/:jobId/cancel` at src/routes/character-emotion-avatars.ts:71-89

Both call `checkActorOwnership(database, actorId, ...)` on the path actor, then immediately `emotionAvatarService.getJobStatus(jobId)` / `cancelJob(jobId)`. The job store is process-global and keyed only by job id, so ownership of the job is never compared to ownership of the path actor.

**Reproduction (measured 2026-10-04):** a user owning actor A issued GET on `/actors/{A}/emotion-avatars/jobs/{jobB}` with `jobB` belonging to actor B, and received 200 with a body containing B's `actorId`. The same user cancelled B's job via `POST /actors/{A}/emotion-avatars/jobs/{jobB}/cancel` and received `{"ok":true,"cancelled":true}` with the victim job flipped to cancelled.

**Impact:** cross-tenant read of another user's generation job state, and denial of service by cancelling their in-flight batch.

**Fix direction:** after the ownership check resolves, assert `job.actorId === actorId` and return the same 404 as the not-found branch, mirroring the guard added in BUG-routes-character-avatars-subdir-is-shadowed-by-flat-file-cru (`avatar.actorId !== actorId` -> 404). The missing-job branch at :67 and :85 must stay indistinguishable from the foreign-job branch so the endpoint is not an enumeration oracle. Non-breaking for the web UI: frontend/alpine/actor-emotion-avatars.ts only ever passes job ids it created for its own actor.

**Acceptance Criteria:**
- [ ] GET jobs/:jobId returns 404 for a job belonging to another actor
- [ ] POST jobs/:jobId/cancel returns 404 for a job belonging to another actor
- [ ] The not-found and foreign-job responses are byte-identical
- [ ] Regression tests cover both handlers in the existing test file for this route

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
