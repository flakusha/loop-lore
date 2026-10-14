<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: feat(api): emit deprecation headers on legacy unversioned /api/* responses

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** routing-versioning-consolidation

**Summary:**

Sources: stream-a #4 (deprecation wired nowhere on legacy); stream-c #4 (legacy surface emits no headers). Where: src/routes/middleware/deprecation-headers.ts:8-9 (doc comment); src/elysia-app.ts:267-288 (catch-all); src/server/handler.ts:140-155 (legacy dispatch). Gap: module doc comment promises wiring into the v1 barrel and the legacy `/api/*` surface, but deprecationAfterHandle is registered only in the two v1 barrel entry points and applyDeprecationHeaders has zero production call sites. Unversioned clients get no Sunset/Deprecation/Link headers. Related: T06 covers the same legacy path skipping governanceGuard. Acceptance: unversioned `/api/*` responses via catch-all/legacy dispatch carry the same env-gated (API_V1_DEPRECATED) Sunset/Deprecation/Link/X-API-Deprecated-Version headers as v1 responses, or the doc comment is corrected to v1 barrel only. A test pins header presence (or documented absence) on a legacy-path response. Priority: low - signaling only, env-gated and off by default; zero current impact.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
