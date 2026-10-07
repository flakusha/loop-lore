<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Build-time OpenAPI export (scripts/gen-openapi.ts, gen-api-docs.ts, docs:api)

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Spec epic-openapi-reference.md:82-93 requires a static openapi.json exported at build time plus a markdown transform. Today the spec is served only at runtime via @elysia/openapi. No scripts/gen-openapi.ts, no docs:api script.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] scripts/gen-openapi.ts runs the server briefly, fetches the spec, writes docs/reference/openapi.json.
- [ ] scripts/gen-api-docs.ts transforms the JSON to VitePress markdown.
- [ ] docs:api script in package.json chains both.
- [ ] Committed docs/reference/openapi.json non-empty (paths populated).
- [ ] bun run check green.

**Related:** src/routes/v1/openapi.ts, .plan/epics/epic-openapi-reference.md
