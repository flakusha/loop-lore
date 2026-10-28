<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: View-set CRUD and gallery surface

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-view-set-generation
**Tags:** views, gallery, routes
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Routes plus TypeBox validation schemas (following the comfyui-builder pattern) and gallery set cards plus a set modal with camera chips; single-select tag filter extended to filter by set membership. AC: owner-scoped CRUD with 401/403/404 paths tested; non-owner cannot mutate; gallery renders sets without loading full-size blobs (rendition/thumb path).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
