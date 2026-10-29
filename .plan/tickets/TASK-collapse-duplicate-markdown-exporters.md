<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: collapse duplicate markdown exporters

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-blog-system
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-blog-system.md (also narrative-publishing-workflows). Enumerate every markdown exporter/writer in src, collapse to one path with inputs/outputs/test acceptance; unblocks EPUB/blog/static-site work. Caveats: divergent caller expectations, silent format drift.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
