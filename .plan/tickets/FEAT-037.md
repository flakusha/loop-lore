<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-037: Legacy API redirect

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status**: closed
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**: epic-api-versioning.md
**Related**: FEAT-035, FEAT-036

Git issue: `f6f4511`

## Resolution

Already implemented and verified as part of the FEAT-035 work on branch
`api-versioning-feat035`:

- `src/routes/middleware/version-redirect.ts` issues `308 Permanent
  Redirect` from `/api/{path}` to `/api/v1/{path}`, preserving method,
  body, and query string; sets `X-API-Version: v1`.
- `src/elysia-app.ts` catch-all applies it to every unversioned
  `/api/*` request (except `/api/v1/*` and the `/api/views/*` HTML
  carve-out, which falls through to legacy dispatch).
- `src/routes/middleware/version-redirect.test.ts` covers 308 semantics,
  query preservation, custom target versions, and empty bodies (all pass).

Live-app probes confirm: `/api/rpg/dice/roll` → 308
`Location: /api/v1/rpg/dice/roll`; `/api/actor-notes/...` and
`/api/actors/:id/notes/:id` → 308 with nested paths intact;
`/api/v1/*`, `/health/live`, `/metrics`, `/views/*` unaffected.
