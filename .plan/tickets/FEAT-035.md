<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-035: Version prefix routing

**Status**: closed
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**: epic-api-versioning.md
**Related**: FEAT-036, FEAT-037

Git issue: `0fe7f31`

## Resolution

Implemented on branch `api-versioning-feat035` (worktree `tree/api-versioning-feat035`).

- All versioned route factories now accept a `prefix` parameter (default
  `/api`): barrel `index.ts` files, entity-factory-based routes
  (`createEntityRoutes` in `src/routes/entity-routes/index.ts`), leaf
  factories with formerly hardcoded `/api` paths, and the controllers
  outside `src/routes/` (`age-gate`, `assets`, `generation`, `personas`,
  `inference`, `image-edit`).
- `src/routes/v1/index.ts` mounts the full versioned surface under
  `/api/v1/` (previously 4 routes; now every client-facing route module).
  Deliberately unversioned: `livenessRoutes`/`metricsRoutes` (infra
  probes), `federationRoutes` (peer-protocol fixed paths), `viewRoutes`
  (HTML pages).
- `src/elysia-app.ts` catch-all redirects unversioned `/api/{resource}` →
  `/api/v1/{resource}` via 308 (FEAT-037), with `/api/views/*` carved out
  (HTML, never versioned).
- Verified: targeted bun tests (85 pass across v1/middleware/entity/
  proactive/npc/music-links/actor-*/character-* tests), live-app probes
  (`/api/v1/health`, `/api/v1/actors`, `/api/v1/assets`,
  `/api/v1/rpg/dice/roll`, `/api/v1/openapi/json` all 200; legacy
  `/api/...` 308 → `/api/v1/...`; `/health/live`, `/metrics`, `/views/*`
  unversioned as before), full `bun run check` 24/24 PASS.
