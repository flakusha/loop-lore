<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: fix(server): gate docs serving on config, redirect /docs to /docs/

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** server-hardening

**Summary:**

Sources: stream-a #12. Where: src/server/static-files.ts:handleDocsRequest (:126-132: process.env.DOCS_ENABLED, /docs/ prefix check). Gap: the docs gate reads process.env.DOCS_ENABLED directly instead of resolved config, so config-file/hot-apply changes cannot toggle it; /docs without trailing slash misses the prefix check and falls through to a misleading static 404. Acceptance: docs-enabled flag flows from resolved config through createNonApiHandler; setting it via config file toggles serving. GET /docs redirects to /docs/ instead of 404ing. Priority: low - docs-serving edge; config-bypass class is worth fixing while nearby.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
