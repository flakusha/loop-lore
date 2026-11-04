<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Marketplace prereqs: card-world round-trip plus license plus hash

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Business-use marketplace needs: export-import round-trip, license field per asset, content hash + provenance, one-click local install. No marketplace before this lands. Builds on memory-to-lorebook provenance habit. Research: metaapp-usages mode 2; MiniTavern card-market norms.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
