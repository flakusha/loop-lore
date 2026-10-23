<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(server): gate docs serving on config, redirect /docs to /docs/

**Status:** Done
**Status Note:** fixed on this branch — `handleDocsRequest` gates on the resolved config (`docs.enabled === false` → not served) instead of reading `process.env.DOCS_ENABLED` directly, and `GET /docs` now answers 302 → `/docs/` instead of falling through to a misleading static 404 (`src/server/static-files.ts:120-140`). Regression tests in src/server/static-files.test.ts ("ignores DOCS_ENABLED and gates only on the resolved config", "redirects /docs to /docs/").
**Priority:** low
**Effort:** Medium
**Caveats:** stale state — the docs gate now reads the resolved config (docs.enabled) while src/routes/views/layout.ts still reads process.env.DOCS_ENABLED directly, so a config-file-only change to docs.enabled can leave the sidebar link and the served docs disagreeing
**Epic:** epic-server-lifecycle-hardening

**Summary:**

Sources: stream-a #12. Where: src/server/static-files.ts:handleDocsRequest (:126-132: process.env.DOCS_ENABLED, /docs/ prefix check). Gap: the docs gate reads process.env.DOCS_ENABLED directly instead of resolved config, so config-file/hot-apply changes cannot toggle it; /docs without trailing slash misses the prefix check and falls through to a misleading static 404. Acceptance: docs-enabled flag flows from resolved config through createNonApiHandler; setting it via config file toggles serving. GET /docs redirects to /docs/ instead of 404ing. Priority: low - docs-serving edge; config-bypass class is worth fixing while nearby.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
