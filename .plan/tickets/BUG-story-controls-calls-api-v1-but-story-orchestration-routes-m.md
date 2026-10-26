<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: story-controls calls /api/v1 but story-orchestration routes mount only at /api

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-frontend-backend-integration

**Summary:**

Two defects in src/frontend/alpine/story-controls.ts make every story control 404 at HEAD.

## Defect 1 - prefix mismatch

- src/frontend/alpine/story-controls.ts:8-9 documents and calls POST /api/v1/chats/:id/story/pause|resume|step and POST /api/v1/chats/:id/gm/escalate.
- src/routes/story-orchestration/index.ts:45-47 builds every route from a `prefix` parameter defaulting to `/api`.
- src/app/register-plugins.ts:65 mounts it exactly once, unversioned: `app.use(storyOrchestrationRoutes(handleOpts),)`. There is no /api/v1 second mount.
- Contrast register-plugins.ts:63-64, where locationExplorerRoutes and gameStateRoutes ARE double-mounted at /api/v1.
- src/elysia-app.ts:280-281 only 308-redirects paths that do NOT already start with /api/v1/, so a /api/v1/... call is never rescued.

## Defect 2 - escalate uses the wrong path segment

story-controls.ts:55 interpolates the action into a single template for every action:

    apiFetch(`/api/v1/chats/${chatId}/story/${action}`, ...)

So escalate is sent to POST /api/v1/chats/:id/story/escalate, but the route is registered at `${prefix}/chats/:id/gm/escalate` (src/routes/story-orchestration/index.ts:159). The doc comment at lines 8-9 states the gm/escalate path, so the code contradicts its own spec header. Escalate is therefore wrong twice over - wrong prefix AND wrong path segment.

## Consequence

The story controls are broken in the browser at HEAD - every action returns 404 and the UI shows a failure toast. src/frontend/alpine/story-state.test.ts:373 asserts the /api/v1 pause call and passes only because it mocks fetch and never reaches a real route.

## Provenance

src/routes/story-orchestration/api-versioning.test.ts was written to pin this. It looped over both "/api" and "/api/v1" (line 162) and failed exactly on the three /api/v1 cases: pause, state and gm/escalate. It was deleted in d4a451215 rather than weakened, because deleting it does NOT fix the mismatch - it only stops a false green. The underlying /api/v1 defect remains open.

## Decision needed

Either:
(a) add the versioned mount in register-plugins.ts, matching the locationExplorerRoutes / gameStateRoutes double-mount pattern at lines 63-64; or
(b) repoint story-controls.ts at /api.

Option (b) alone still leaves escalate broken (defect 2) - story-controls would still need a per-action path, or the backend route would need to move to /story/escalate.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 7ff9731 (registry tip: 91390c8b1 Konstantin Fedotov Close issue)
