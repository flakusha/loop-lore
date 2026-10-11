<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: fix(routing): consolidate versioned mounts into v1 barrel, drop unversioned halves

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** routing-versioning-consolidation

**Summary:**

Sources: stream-a #1 (locationExplorer double-mount); stream-b #2 (gameState/locationExplorer outside barrel); stream-b #3 (dual mounts defeat 308). Where: src/app/register-plugins.ts:registerPlugins; src/routes/v1/*-surface.ts; src/elysia-app.ts:271-278 (catch-all 308). Gap: gameStateRoutes serves /api/v1/... from outside the v1 barrel, missing governanceGuard, deprecation headers, and OpenAPI (versionResolver is global at src/elysia-app.ts:221, so outside-barrel routes still get it). locationExplorerRoutes is double-mounted (unversioned + /api/v1), and healthRoutes plus memoryAuditRoutes share the dual-mount shape, so unversioned requests return 200 instead of the specified 308. Acceptance: gameStateRoutes and locationExplorerRoutes mounted once via a v1 surface with prefix /api/v1; no registerPlugins mount serves /api/v1/... paths. Unversioned halves removed (or recorded as spec-fixed exceptions); GET /api/location-explorer/..., /api/health, /api/actors/:id/memories/audit return 308. Barrel behavior observable on moved routes: same rate-limit and deprecation-header responses as siblings. Priority: high - versioned paths bypass barrel rate-limiting/governance and versioning contract violated. Verified 2026-10-11: versionResolver global (elysia-app.ts:221); gap narrowed to governance/deprecation/OpenAPI.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
