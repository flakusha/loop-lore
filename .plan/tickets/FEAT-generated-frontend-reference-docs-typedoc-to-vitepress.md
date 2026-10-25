<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: Generated frontend reference docs (Typedoc to VitePress)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

- **Why**: the REST API surface already has a source-generated, served, drift-gated reference (Elysia OpenAPI at `GET /api/v1/openapi/json`, `bun run openapi` -> `docs/reference/openapi.json`, blocking `api - doc drift` gate). The frontend Alpine/TS modules (`src/frontend/alpine/**`, `src/frontend/*.ts`) have lint-enforced JSDoc but no generated, served reference.
- **Proposal**: Typedoc generation over the frontend tsconfig project, emitted into `docs/reference/frontend/`, wired into the existing VitePress chain (`docs:build` already runs `giwt plan sync-docs && vitepress build docs`; `vitepress` is already a devDependency; `typedoc` is NOT yet a dependency — add it when implementing).
- **Deferred deliberately**: backend and frontend surfaces are still moving; a generated reference would churn on every merge until they stabilize. File now, implement when the surface quiets down.
- **Prerequisite to state honestly**: JSDoc coverage on frontend modules is uneven — some modules are thoroughly documented, others carry only `@param`-less stubs. Until comment density improves, the generator will produce thin pages for those modules. Implementing this ticket includes a JSDoc pass on whatever modules the output should cover.
- **Non-goals**: no changes to the REST API docs pipeline (already generated + gated); no hand-maintained reference pages.
- **Acceptance criteria**: [ ] `typedoc` dependency + config added; [ ] generation emits into `docs/reference/frontend/` and is wired into `docs:build`; [ ] pages reachable in the built VitePress site; [ ] a freshness gate (or docs:build step) prevents silent drift, mirroring the `api - doc drift` precedent; [ ] covered modules meet the JSDoc bar (no hollow pages).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
