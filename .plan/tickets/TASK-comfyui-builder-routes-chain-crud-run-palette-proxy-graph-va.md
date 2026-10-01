<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: ComfyUI builder routes: chain CRUD/run, palette proxy, graph validate endpoint

**Status:** Done
**Status Note:** Done 2026-10-01 — commit 0ee740e7 (builder routes + validation schemas)
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-first-class-citizen
**Tags:** comfyui, builder, routes, validation

git issue: 0760fe2

**Summary:**

Implements Track A/B server seam of docs/meta/research/comfyui-graph-builder-frontend-plan.md section 4 (phased ticket 2). Builder routes mounted in src/routes/v1/content-surface.ts next to imageEditRoutes: chain CRUD (persist prompt_templates workflow rows from ticket 1), chain-run delegating to handleRun (src/image-edit/routes.ts:69), palette proxy via handleNodes (GET /object_info, :152-160), graph validate endpoint using findDeadNodes + TERMINAL_SINK_CLASSES sink rule (src/generation/workflow-loader/workflow-validation.ts:14,31,60; reject dead non-sinks). Blocked on handleRun IDOR authz close (epic-comfyui-plugin Phase 0).

**Context:**

Routes live in src/routes/comfyui-builder/, mounted in content-surface.ts beside imageEditRoutes. Chain CRUD is owner-scoped through getOwnedTemplate/chain-store; run POST starts an in-memory job and returns { jobId } with GET polling (owner-checked). Palette proxy calls the shared ComfyUI provider and maps failures to 502/504 (configured base URL only, no user-controlled hosts). Graph validate is static: duplicate ids, acyclic check via Kahn sweep, missing-input edges, dead non-sink nodes (findDeadNodes + TERMINAL_SINK_CLASSES reuse).

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
