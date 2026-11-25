<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: OpenAPI spec omits harness routes plugin

**Status:** Done
**Status Note:** 2026-11-25 reconcile: the generated spec now carries every harness path family — 19 `/api/v1/harness/*` paths in `docs/reference/openapi.json` (e.g. `/api/v1/harness/settings` at `:84952`); the harness route plugins are mounted in the v1 admin surface (`src/routes/v1/admin-surface.ts:21-29,66-103`). The filed premise (harness routes absent from the spec) was stale.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-contract-and-config-tooling
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Reported by RSI repo-access lane (evidence verified 2026-11-11/12 on dev + worktree).

NODE_ENV=development bun scripts/generate-openapi.ts exits 0, but grep 'harness/settings' on the generated docs/reference/openapi.json returns 0 hits: every /api/v1/harness/* endpoint (settings incl. repoAccessEnabled, runs, stats, metrics, ledger, stream, queue, permissions, usage, models, files) is absent from the served OpenAPI spec and the VitePress API pages.

The generator (scripts/generate-openapi.ts:65-68) mounts v1Routes (whose adminSurface wires harnessRoutes, src/routes/v1/admin-surface.ts:48) plus registerPlugins, and still collects no harness paths — so the omission is not a missing .use() at first glance; diagnose why Elysia spec collection drops the plugin (guard wrapper, plugin name collision, or schema decoration) and fix.

Fix shape (per lane proposal): ensure the harness routes plugin contributes its paths to the collected spec; route response schemas already exist (e.g. src/routes/harness/usage.ts HarnessUsageResponse). Deserves its own review: touches every harness endpoint's spec surface.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
