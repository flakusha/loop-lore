<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(routing): mount story-orchestration, agency, config-menu under /api/v1 or declare unversioned-by-spec

**Status:** Done
**Status Note:** [2026-10-26 final pass] VERIFIED + partially corrected: `agencyRoutes`, `storyOrchestrationRoutes` and `configMenuRoutes` all now declare `prefix = "/api/v1"` as their DEFAULT (config-menu.ts:99 — the hardcoded `/api/config-menu` path is gone), so registering them from `src/app/register-plugins.ts` yields /api/v1 paths; they have no other production mount (only tests), so there is no dual mount for these three. The dual-mount half of this ticket applied to `memory-audit` (nested in the v1 actors surface AND mounted top-level) and to `location-explorer` (registered twice) — both fixed, see BUG-fix-routing-consolidate-versioned-mounts-into-v1-barrel-drop. Verified by grep over src/app, src/routes/v1 and src/elysia-app.ts.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-api-routes

**Summary:**

Sources: stream-a #2; stream-b #1. Where: src/app/register-plugins.ts:60-67; src/routes/v1/index.ts:v1Routes (all surfaces); src/routes/config-menu.ts:55-57 (hardcoded /api/config-menu, no prefix param). Gap: storyOrchestrationRoutes, agencyRoutes, and configMenuRoutes mount unversioned-only with no v1-surface coverage, so their /api/v1/... paths 404 (or only resolve via the legacy strip-prefix fallback in src/server/handler.ts:146-155, bypassing barrel hooks). config-menu.ts cannot even take a prefix today - the path is hardcoded. Nuance (verified): A#2's claim that memoryAudit has no versioned route is incorrect - src/routes/actor-memories.ts:173 nests memoryAuditRoutes inside actorMemoriesRoutes, mounted at /api/v1; memoryAudit's real issue is its dual mount, covered by T01. Acceptance: each of story-orchestration/agency/config-menu is either wired into a v1 surface at /api/v1/... (config-menu gains a prefix parameter) or recorded alongside federation/views as an intentional unversioned exception with rationale. v1-enforcement-style coverage pins each decision: versioned 200s or unversioned-308, no silent 404/200 split. Priority: medium - inconsistent versioning surface; fallback currently masks the gap but skips barrel hooks.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 3f07a06 (registry tip: 818261f3e Konstantin Fedotov Close issue)
