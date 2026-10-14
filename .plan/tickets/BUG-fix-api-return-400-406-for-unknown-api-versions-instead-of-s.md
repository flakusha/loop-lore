<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(api): return 400/406 for unknown API versions instead of silent v1 coercion

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** routing-versioning-consolidation

**Summary:**

Sources: stream-c #5. Where: src/routes/middleware/version-resolver.ts:37-53; src/elysia-app.ts:276-277. Gap: /api/v2/... (path or Accept: application/vnd.loop-lore.v2+json) falls through to DEFAULT_VERSION 1, and the catch-all then 308s /api/v2/x to /api/v1/v2/x (404). Future-version clients get a confusing redirect-to-404 instead of a signal naming supported versions. Acceptance: unsupported version signals return a 4xx JSON envelope listing supported versions; no double-prefix redirect (/api/v1/v2/...) is emitted for them. Priority: low - no v2 exists today; future-proofing only.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
