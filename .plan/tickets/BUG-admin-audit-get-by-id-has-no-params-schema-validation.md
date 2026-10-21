<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Admin audit get-by-id has no params schema validation

**Status:** Done
**Priority:** low
**Effort:** Medium

**Summary:**

The GET /api/v1/admin/audit/:id route (src/routes/admin/audit.ts:134-176) does not declare a params schema, so the id parameter is not validated by Elysia before reaching the handler. Impact: Minor — malformed IDs produce a confusing 404 rather than a clean 400. Fix: Add params: t.Object({ id: t.String() }) to the route options.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
