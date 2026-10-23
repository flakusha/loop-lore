<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(routing): bring POST /api/v1/assets under barrel governance or pin the carve-out

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-api-routes

**Summary:**

Sources: stream-a #5 (standalone POST skips barrel hooks); stream-b #4 (upload lives outside barrel). Where: src/elysia-app.ts:259 (app.post /api/v1/assets with parse none); src/routes/v1/index.ts:46-58 (barrel hooks); src/assets/controller.ts:156-160 (multipart rationale). Gap: the multipart upload route is registered directly on the parent app after v1Routes to preserve parse:none body handling, so it misses barrel-scoped governanceGuard and deprecationAfterHandle covering every other /api/v1/* route. An expensive file-upload handler is exactly the path that should not skip throttling. Acceptance: POST /api/v1/assets exhibits the same 429/deprecation-header behavior as sibling asset routes, or a code comment + regression test pins why it is permanently exempt. The parse:none multipart behavior is preserved either way. Priority: high - unthrottled file-upload path bypassing the same governance T01 fixes for other routes.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
