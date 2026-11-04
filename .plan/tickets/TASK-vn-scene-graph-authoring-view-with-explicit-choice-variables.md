<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: VN scene-graph authoring view with explicit choice variables

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Runtime VN exists (choice cards, transitions epic); no authoring graph. Borrow RenPy-VisualEditor pattern: parse scene/choice schema into node tree (scene/branch/choice + false-branch), render flow view for branch/recombine editing (epic-locations C7 P3-4). Differentiator: explicit choice-variable entities (RenPy-VisualEditor lacks them). Research: .tmp/research/metaapp-usages-2026-11-03.md mode 1.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
