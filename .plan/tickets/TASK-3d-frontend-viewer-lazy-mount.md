<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: 3D frontend viewer lazy mount

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-3d-generation
**Tags:** 3d, frontend
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

model-viewer plus three.js splat addon viewer partials, htmx revealed mounting, device-tier gate, 2D poster fallback, and gallery/modal/detail integration (keeps the stub device-tier caveat). AC: a gallery grid with 3D assets loads zero 3D libraries until scroll-in; unsupported tier shows poster only; no CSP regressions (nonce-d module loads).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
